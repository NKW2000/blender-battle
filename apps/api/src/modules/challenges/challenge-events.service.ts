import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiErrorCode, ChallengeStatus } from '@bb/shared';
import { DataSource, IsNull, Not, Repository } from 'typeorm';

import { AppException } from '@/common/exceptions/app.exception';

import { Challenge } from './entities/challenge.entity';
import { ChallengeEntry } from './entities/challenge-entry.entity';
import { ChallengeVote } from './entities/challenge-vote.entity';

/** Which part of an event's lifecycle a challenge is in, derived from its dates. */
export type EventPhase = 'upcoming' | 'open' | 'voting' | 'finished' | 'not-an-event';

@Injectable()
export class ChallengeEventsService {
  constructor(
    @InjectRepository(Challenge) private readonly challenges: Repository<Challenge>,
    @InjectRepository(ChallengeEntry) private readonly entries: Repository<ChallengeEntry>,
    @InjectRepository(ChallengeVote) private readonly votes: Repository<ChallengeVote>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * The phase is computed from the dates rather than stored.
   *
   * A stored status would need a scheduler to keep it honest and could drift out
   * of step with the very timestamps it is supposed to describe. Two dates and
   * the current time answer the question exactly, from any process, with no
   * background job to fall behind.
   */
  phaseOf(challenge: Challenge, now = new Date()): EventPhase {
    if (!challenge.startDate || !challenge.endDate) return 'not-an-event';
    if (now < challenge.startDate) return 'upcoming';
    if (now < challenge.endDate) return 'open';
    // Finished once the winner is frozen, or once the voting deadline passes —
    // the scheduler resolves the winner right after that, but the phase flips
    // immediately so a late vote is refused even before the sweep runs.
    if (challenge.winnerEntryId) return 'finished';
    if (challenge.votingEndsAt && now >= challenge.votingEndsAt) return 'finished';
    return 'voting';
  }

  /** Public challenges with a window, newest first. */
  async listEvents(): Promise<Challenge[]> {
    return this.challenges.find({
      where: { startDate: Not(IsNull()), status: ChallengeStatus.PUBLISHED },
      relations: ['category', 'assets'],
      order: { startDate: 'DESC' },
      take: 50,
    });
  }

  async findEventOrFail(id: string): Promise<Challenge> {
    const challenge = await this.challenges.findOne({
      where: { id },
      relations: ['category', 'assets'],
    });
    if (!challenge) throw AppException.notFound('Challenge');
    return challenge;
  }

  /**
   * Guard run before any bytes are uploaded.
   *
   * This is the rule behind "the upload buttons disappear when the end date
   * passes": hiding the button is presentation, refusing the write is the rule.
   * A request that began before the deadline but arrived after it is still late,
   * or a slow upload would buy extra time.
   */
  async assertOpenForEntry(challengeId: string): Promise<Challenge> {
    const challenge = await this.findEventOrFail(challengeId);
    const phase = this.phaseOf(challenge);

    if (phase === 'not-an-event') {
      throw new AppException(
        ApiErrorCode.CONFLICT,
        'This challenge is not an open competition',
        409,
      );
    }
    if (phase === 'upcoming') {
      throw new AppException(ApiErrorCode.CONFLICT, 'This challenge has not opened yet', 409);
    }
    if (phase !== 'open') {
      throw new AppException(ApiErrorCode.CONFLICT, 'The deadline has passed', 409);
    }

    return challenge;
  }

  /** Create or replace this artist's entry. One per person, enforced by the index. */
  async submitEntry(
    challengeId: string,
    userId: string,
    assets: { imageUrl: string; workspacePhotoUrl: string },
    notes?: string,
  ): Promise<ChallengeEntry> {
    await this.assertOpenForEntry(challengeId);

    const existing = await this.entries.findOne({ where: { challengeId, userId } });

    if (existing) {
      await this.entries.update(
        { id: existing.id },
        { ...assets, notes: notes ?? null, submittedAt: () => 'now()' },
      );
    } else {
      await this.entries.insert({ challengeId, userId, ...assets, notes: notes ?? null });
    }

    const saved = await this.entries.findOne({ where: { challengeId, userId } });
    if (!saved) throw AppException.notFound('Entry');
    return saved;
  }

  /** Entries on show. Hidden ones are excluded everywhere, including tallies. */
  /**
   * Entries in a stable order — submission time, oldest first.
   *
   * Deliberately NOT ordered by vote count. The ballot polls while voting is
   * open, and ranking the list live would make the card a voter is looking at
   * jump to someone else's entry the moment a vote lands, and float the current
   * leader to the top where it collects still more votes. A fixed order keeps the
   * wheel steady and the vote honest; the winner is decided from `winnerEntryId`,
   * never from this order.
   */
  async listEntries(challengeId: string): Promise<ChallengeEntry[]> {
    return this.entries.find({
      where: { challengeId, isHidden: false },
      relations: ['user'],
      order: { submittedAt: 'ASC' },
    });
  }

  async myVote(challengeId: string, voterId: string): Promise<string | null> {
    const vote = await this.votes.findOne({ where: { challengeId, voterId } });
    return vote?.entryId ?? null;
  }

  /**
   * Vote for the winner. One shot, final.
   *
   * A vote cannot be moved or withdrawn. The client confirms the choice before
   * sending, and once cast the ballot is closed to that voter until the next
   * challenge — so this refuses a second vote rather than reassigning the first.
   * That is what makes the blind vote meaningful: you commit to one entry with no
   * knowledge of the tally and no chance to chase a leader.
   *
   * The unique key on `(challenge, voter)` is the real guard. The application
   * check below is the friendly error; the constraint is what actually stops a
   * double vote under a race, where two requests both read "no previous vote".
   */
  async vote(challengeId: string, voterId: string, entryId: string): Promise<{ entryId: string }> {
    const challenge = await this.findEventOrFail(challengeId);
    const phase = this.phaseOf(challenge);

    if (phase !== 'voting') {
      throw new AppException(
        ApiErrorCode.CONFLICT,
        phase === 'finished' ? 'Voting has closed' : 'Voting has not opened yet',
        409,
      );
    }

    const entry = await this.entries.findOne({ where: { id: entryId } });
    if (!entry || entry.challengeId !== challengeId) {
      throw new AppException(ApiErrorCode.NOT_FOUND, 'Entry not found', 404);
    }
    if (entry.isHidden) {
      throw new AppException(ApiErrorCode.CONFLICT, 'This entry has been withdrawn', 409);
    }

    // Voting for your own work is the one thing that makes an open vote
    // worthless, so it is refused server-side rather than hidden in the UI.
    if (entry.userId === voterId) {
      throw new AppException(ApiErrorCode.FORBIDDEN, 'You cannot vote for your own entry', 403);
    }

    const already = await this.votes.findOne({ where: { challengeId, voterId } });
    if (already) {
      throw new AppException(ApiErrorCode.CONFLICT, 'You have already voted in this challenge', 409);
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.insert(ChallengeVote, { challengeId, entryId, voterId });
        await manager.increment(ChallengeEntry, { id: entryId }, 'voteCount', 1);
      });
    } catch (error) {
      // Two requests raced past the check above; the unique constraint rejected
      // the second. Report it as the same friendly conflict, not a 500.
      if (isUniqueViolation(error)) {
        throw new AppException(ApiErrorCode.CONFLICT, 'You have already voted in this challenge', 409);
      }
      throw error;
    }

    return { entryId };
  }

  /**
   * Schedule a challenge as a public event, or reschedule one.
   *
   * The caller gives a start time and two lengths in hours; the submission
   * deadline and the vote deadline are derived here so the two windows can never
   * be entered out of order. Rescheduling is refused once the event has entries
   * — moving the goalposts after people have committed work is exactly what a
   * fixed deadline exists to prevent.
   */
  async schedule(
    challengeId: string,
    input: { startDate: Date; submitHours: number; voteHours: number },
  ): Promise<Challenge> {
    const challenge = await this.findEventOrFail(challengeId);

    if (challenge.winnerEntryId) {
      throw new AppException(ApiErrorCode.CONFLICT, 'This event has already finished', 409);
    }

    const entryCount = await this.entries.count({ where: { challengeId } });
    if (entryCount > 0) {
      throw new AppException(
        ApiErrorCode.CONFLICT,
        'Entries have already been submitted, so the schedule is locked',
        409,
      );
    }

    if (input.submitHours <= 0 || input.voteHours <= 0) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, 'Both windows must be positive', 400);
    }

    const startDate = input.startDate;
    const endDate = new Date(startDate.getTime() + input.submitHours * 3_600_000);
    const votingEndsAt = new Date(endDate.getTime() + input.voteHours * 3_600_000);

    await this.challenges.update({ id: challengeId }, { startDate, endDate, votingEndsAt });
    return this.findEventOrFail(challengeId);
  }

  /** Clear the schedule, turning an event back into an ordinary catalogue brief. */
  async unschedule(challengeId: string): Promise<Challenge> {
    await this.findEventOrFail(challengeId); // 404s if the challenge is gone
    const entryCount = await this.entries.count({ where: { challengeId } });
    if (entryCount > 0) {
      throw new AppException(
        ApiErrorCode.CONFLICT,
        'Entries have already been submitted; the event cannot be un-scheduled',
        409,
      );
    }
    await this.challenges.update(
      { id: challengeId },
      { startDate: null, endDate: null, votingEndsAt: null, winnerEntryId: null },
    );
    return this.findEventOrFail(challengeId);
  }

  /**
   * Freeze the result.
   *
   * Ties break on the earliest submission — a deterministic rule that always
   * terminates, rather than leaving an event with no winner.
   */
  async closeVoting(challengeId: string): Promise<Challenge> {
    const challenge = await this.findEventOrFail(challengeId);

    if (this.phaseOf(challenge) !== 'voting') {
      throw new AppException(ApiErrorCode.CONFLICT, 'This event is not in voting', 409);
    }

    const entries = await this.listEntries(challengeId);
    if (entries.length === 0) {
      throw new AppException(ApiErrorCode.CONFLICT, 'Nobody entered this challenge', 409);
    }

    await this.freezeWinner(challengeId, entries);
    return this.findEventOrFail(challengeId);
  }

  /**
   * The scheduler's entry point: resolve every event whose vote deadline has
   * elapsed but whose winner is not yet frozen.
   *
   * Runs the same winner rule as the manual close, and tolerates an empty
   * ballot — an event nobody voted on still needs to leave the voting phase, so
   * it is marked finished with no winner rather than sitting open forever.
   */
  async resolveDueEvents(now = new Date()): Promise<number> {
    const due = await this.challenges
      .createQueryBuilder('challenge')
      .where('challenge.voting_ends_at IS NOT NULL')
      .andWhere('challenge.voting_ends_at <= :now', { now })
      .andWhere('challenge.winner_entry_id IS NULL')
      .andWhere('challenge.start_date IS NOT NULL AND challenge.end_date IS NOT NULL')
      .take(50)
      .getMany();

    let resolved = 0;
    for (const challenge of due) {
      const entries = await this.listEntries(challenge.id);
      // An empty ballot has no winner to freeze, and phaseOf already reports it
      // finished from the elapsed deadline, so there is nothing to write.
      if (entries.length === 0) continue;

      // Conditional update so two instances sweeping at once cannot both freeze
      // it — only the one whose UPDATE still sees a null winner does the work.
      const claimed = await this.challenges
        .createQueryBuilder()
        .update(Challenge)
        .set({ winnerEntryId: this.pickWinner(entries).id })
        .where('id = :id AND winner_entry_id IS NULL', { id: challenge.id })
        .execute();
      if (claimed.affected) resolved += 1;
    }
    return resolved;
  }

  private async freezeWinner(challengeId: string, entries: ChallengeEntry[]): Promise<void> {
    await this.challenges.update(
      { id: challengeId },
      { winnerEntryId: this.pickWinner(entries).id },
    );
  }

  /** Most votes, ties broken by the earliest submission. Always terminates. */
  private pickWinner(entries: ChallengeEntry[]): ChallengeEntry {
    return [...entries].sort(
      (a, b) =>
        b.voteCount - a.voteCount ||
        new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
    )[0]!;
  }
}

/** Postgres 23505 = unique_violation, surfaced through TypeORM's driverError. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { driverError?: { code?: string } })?.driverError?.code === '23505';
}
