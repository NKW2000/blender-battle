import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ApiErrorCode,
  ChallengeAssetType,
  RoomParticipantStatus,
  RoomStatus,
  VOTE_SECONDS_PER_ENTRY,
  VOTE_STEP_GRACE_SECONDS,
  VOTE_WINDOW_SECONDS,
} from '@bb/shared';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';

import { AppException } from '@/common/exceptions/app.exception';
import { RedisService } from '@/modules/redis/redis.service';

import { Room } from './entities/room.entity';
import { RoomParticipant } from './entities/room-participant.entity';
import { Submission } from './entities/submission.entity';
import { SubmissionLike } from './entities/submission-like.entity';
import { RoomsService } from './rooms.service';

/** Redis key holding when a voter opened their ballot. */
const ballotKey = (roomId: string, voterId: string, round: number) =>
  `ballot:${roomId}:${voterId}:${round}`;

@Injectable()
export class BallotService {
  constructor(
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    @InjectRepository(SubmissionLike) private readonly likes: Repository<SubmissionLike>,
    @InjectRepository(RoomParticipant)
    private readonly participants: Repository<RoomParticipant>,
    private readonly rooms: RoomsService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Build this voter's ballot.
   *
   * Three rules are enforced here rather than in the UI, because the UI is not
   * a security boundary:
   *
   *  - the voter's own entry is removed from the list entirely, so it is never
   *    sent to them at all;
   *  - only people who submitted may vote. Eliminated players have nothing at
   *    stake and every incentive to grief, and non-participants would make alt
   *    accounts the cheapest way to swing a result;
   *  - the order is shuffled per voter. A shared order would hand whoever sits
   *    first a systematic advantage across every ballot in the room.
   */
  async open(roomId: string, voterId: string) {
    const room = await this.rooms.findOrFail(roomId);

    if (room.status !== RoomStatus.VOTING && room.status !== RoomStatus.RUNOFF) {
      throw new AppException(
        ApiErrorCode.CONFLICT,
        room.status === RoomStatus.COMPLETED ? 'Voting has closed' : 'Voting has not opened yet',
        409,
      );
    }

    const voter = room.participants.find((entry) => entry.userId === voterId);
    if (!voter || voter.status !== RoomParticipantStatus.SUBMITTED) {
      throw new AppException(
        ApiErrorCode.FORBIDDEN,
        'Only players who submitted an entry can vote in this room',
        403,
      );
    }

    const round = room.status === RoomStatus.RUNOFF ? 1 : 0;
    const entries = await this.eligibleEntries(room, voterId, round);

    if (entries.length === 0) {
      throw new AppException(ApiErrorCode.CONFLICT, 'There is nothing to vote on', 409);
    }

    // Recorded once, then reused: reopening the ballot must not restart the
    // per-entry clock, or a voter could refresh to linger on a rival's work.
    const key = ballotKey(roomId, voterId, round);
    const existing = await this.redis.client.get(key);
    let startedAt = Number(existing);

    if (!existing) {
      startedAt = Date.now();
      await this.redis.client.set(key, String(startedAt), 'EX', VOTE_WINDOW_SECONDS + 60);
    }

    const ordered = this.shuffleFor(entries, `${roomId}:${voterId}`);
    const liked = await this.likedSubmissionIds(roomId, voterId, round);

    return {
      round,
      roomId,
      // The reference the work is judged against, shown beside every entry.
      // Sorted so the same image is used for every voter rather than whichever
      // row the database happened to return first.
      referenceImageUrl:
        (room.challenge?.assets ?? [])
          .filter((asset) => asset.type === ChallengeAssetType.REFERENCE_IMAGE)
          .sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ?? null,
      challengeTitle: room.challenge?.title ?? null,
      secondsPerEntry: VOTE_SECONDS_PER_ENTRY,
      startedAt: new Date(startedAt).toISOString(),
      serverNow: new Date().toISOString(),
      votingEndsAt: room.votingEndsAt?.toISOString() ?? null,
      entries: ordered.map((entry, index) => ({
        submissionId: entry.id,
        imageUrl: entry.imageUrl,
        index,
        // Anonymous on purpose: a name attached to an entry turns the ballot
        // into a popularity vote instead of a judgement of the work.
        liked: liked.has(entry.id),
        // Absolute, server-derived. The client counts down to it; it does not
        // decide it.
        opensAt: new Date(startedAt + index * VOTE_SECONDS_PER_ENTRY * 1000).toISOString(),
        closesAt: new Date(
          startedAt + (index + 1) * VOTE_SECONDS_PER_ENTRY * 1000 + VOTE_STEP_GRACE_SECONDS * 1000,
        ).toISOString(),
      })),
    };
  }

  /**
   * Like an entry, or move a runoff pick onto it.
   *
   * Idempotent by construction: the unique key on (submission, voter, round)
   * means a replayed request updates the same row instead of inflating a tally,
   * which application-level checking cannot guarantee under concurrency.
   */
  async like(roomId: string, voterId: string, submissionId: string, active: boolean) {
    const room = await this.rooms.findOrFail(roomId);
    const round = room.status === RoomStatus.RUNOFF ? 1 : 0;

    if (room.status !== RoomStatus.VOTING && room.status !== RoomStatus.RUNOFF) {
      throw new AppException(ApiErrorCode.CONFLICT, 'Voting has closed', 409);
    }

    const voter = room.participants.find((entry) => entry.userId === voterId);
    if (!voter || voter.status !== RoomParticipantStatus.SUBMITTED) {
      throw new AppException(
        ApiErrorCode.FORBIDDEN,
        'Only players who submitted an entry can vote in this room',
        403,
      );
    }

    const submission = await this.submissions.findOne({ where: { id: submissionId } });
    if (!submission || submission.roomId !== roomId) {
      throw new AppException(ApiErrorCode.NOT_FOUND, 'Submission not found', 404);
    }

    // The real self-vote guard. Hiding the entry client-side is a courtesy;
    // refusing the write is the rule.
    if (submission.userId === voterId) {
      throw new AppException(ApiErrorCode.FORBIDDEN, 'You cannot vote for your own work', 403);
    }

    if (submission.isHidden) {
      throw new AppException(ApiErrorCode.CONFLICT, 'This entry has been withdrawn', 409);
    }

    if (round === 0) {
      await this.assertWithinStepWindow(room, voterId, submissionId);
    }

    /*
      Runoff is a single, movable pick.

      Unlimited likes cannot separate entries that already tied on unlimited
      likes, so the tie-break round forces a choice. Withdrawing the previous
      pick first is what "move the like to another photo" means.
    */
    if (round === 1 && active) {
      await this.likes.update({ roomId, voterId, round }, { active: false });
    }

    await this.likes
      .createQueryBuilder()
      .insert()
      .into(SubmissionLike)
      .values({ roomId, submissionId, voterId, round, active })
      .orUpdate(['active'], ['submission_id', 'voter_id', 'round'])
      .execute();

    return { submissionId, liked: active };
  }

  /**
   * Reject a like that arrives outside the entry's window.
   *
   * The per-entry limit only means anything if the server owns it: a client-held
   * timer can be paused to study a rival's work, or scripted to like everything
   * instantly. A small grace covers render and network latency so an honest
   * click at the very end of the window is not thrown away.
   */
  private async assertWithinStepWindow(room: Room, voterId: string, submissionId: string) {
    const startedAtRaw = await this.redis.client.get(ballotKey(room.id, voterId, 0));
    if (!startedAtRaw) {
      throw new AppException(ApiErrorCode.CONFLICT, 'Open the ballot before voting', 409);
    }

    const entries = await this.eligibleEntries(room, voterId, 0);
    const ordered = this.shuffleFor(entries, `${room.id}:${voterId}`);
    const index = ordered.findIndex((entry) => entry.id === submissionId);

    if (index < 0) {
      throw new AppException(ApiErrorCode.NOT_FOUND, 'That entry is not on your ballot', 404);
    }

    const startedAt = Number(startedAtRaw);
    const opensAt = startedAt + index * VOTE_SECONDS_PER_ENTRY * 1000;
    const closesAt =
      startedAt +
      (index + 1) * VOTE_SECONDS_PER_ENTRY * 1000 +
      VOTE_STEP_GRACE_SECONDS * 1000;
    const now = Date.now();

    if (now < opensAt) {
      throw new AppException(ApiErrorCode.CONFLICT, 'That entry is not up yet', 409);
    }
    if (now > closesAt) {
      throw new AppException(ApiErrorCode.CONFLICT, 'That entry has already passed', 409);
    }
  }

  /**
   * Entries this voter may see: never their own, never withdrawn ones, and in a
   * runoff only those actually tied for the lead.
   */
  private async eligibleEntries(room: Room, voterId: string, round: number) {
    const all = await this.submissions.find({
      where: { roomId: room.id, isHidden: false },
      order: { submittedAt: 'ASC' },
    });

    const mine = all.filter((entry) => entry.userId !== voterId);
    if (round === 0) return mine;

    const participants = await this.participants.find({ where: { roomId: room.id } });
    const byId = new Map(participants.map((entry) => [entry.id, entry]));
    const top = Math.max(...participants.map((entry) => entry.likeCount));

    return mine.filter((entry) => byId.get(entry.participantId)?.likeCount === top);
  }

  private async likedSubmissionIds(roomId: string, voterId: string, round: number) {
    const rows = await this.likes.find({
      where: { roomId, voterId, round, active: true },
      select: { submissionId: true },
    });
    return new Set(rows.map((row) => row.submissionId));
  }

  /**
   * Deterministic per-voter shuffle.
   *
   * Seeded from the room and voter so the order is identical every time this
   * voter loads the ballot — the sequence has to survive a refresh, or the
   * per-entry timer could be reset by reloading — while differing between
   * voters, which is what removes the first-position advantage.
   */
  private shuffleFor<T extends { id: string }>(items: T[], seed: string): T[] {
    const keyed = items.map((item) => ({
      item,
      key: createHash('sha256').update(`${seed}:${item.id}`).digest('hex'),
    }));

    keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return keyed.map((entry) => entry.item);
  }
}
