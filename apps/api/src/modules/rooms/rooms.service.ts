import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BattleResult,
  CHALLENGE_MIN_MINUTES,
  Difficulty,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_DRAW_SECONDS,
  ROOM_MAX_PLAYERS,
  ROOM_MIN_PLAYERS,
  NotificationType,
  ROOM_RANKED_MIN_SUBMISSIONS,
  RoomParticipantStatus,
  RoomStatus,
  RoomVisibility,
  SCORE_LOSS,
  SCORE_WIN,
  VOTE_WINDOW_SECONDS,
} from '@bb/shared';
import { randomInt } from 'node:crypto';
import { DataSource, In, Repository } from 'typeorm';

import { AppException } from '@/common/exceptions/app.exception';
import type { AuthenticatedUser } from '@/common/types/authenticated-user';
import { ChallengesService } from '@/modules/challenges/challenges.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

import { Room } from './entities/room.entity';
import { RoomParticipant } from './entities/room-participant.entity';
import { Submission } from './entities/submission.entity';

const ROOM_RELATIONS = ['host', 'category', 'challenge', 'challenge.category', 'challenge.assets', 'participants', 'participants.user'];

/**
 * Room lifecycle: create, join, draw, close, tally.
 *
 * Two rules run through the whole of this file and are worth stating once:
 *
 *  - The server owns every deadline and every transition. Clients are told
 *    absolute timestamps and never decide when a phase ends.
 *  - The challenge is drawn here, at kickoff, from the host's filters. The host
 *    never names it. A host who could pick the brief would know it before anyone
 *    joined and could arrive with the model already built, which is the one
 *    thing a timed modelling contest cannot survive.
 */
@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
    @InjectRepository(RoomParticipant)
    private readonly participants: Repository<RoomParticipant>,
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    private readonly challenges: ChallengesService,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  // --- Creation and joining ---------------------------------------------------

  /**
   * `endsAt` is an absolute deadline, not a duration — chosen by the host as a
   * date/time and already converted to a UTC instant by the time it reaches
   * here (`CreateRoomDto`). Storing the instant rather than a length in seconds
   * is what makes it timezone-safe: every player's client renders the same
   * instant in their own local time, so nobody has to reason about anyone
   * else's clock.
   *
   * The lobby can sit open for a while before the host presses Start, so this
   * deadline is only a plan at creation time — `start()` re-checks that it
   * still leaves a real modelling window once the round actually begins.
   */
  async create(
    host: AuthenticatedUser,
    dto: {
      name: string;
      categoryId?: string;
      difficulty?: Difficulty;
      maxPlayers?: number;
      visibility?: RoomVisibility;
      endsAt: string;
    },
  ): Promise<Room> {
    const maxPlayers = Math.min(
      ROOM_MAX_PLAYERS,
      Math.max(ROOM_MIN_PLAYERS, dto.maxPlayers ?? 8),
    );

    /*
      A floor, and no ceiling.

      The deadline used to be capped at `CHALLENGE_MAX_MINUTES` from now, which
      is the *challenge author's* estimate of how long a brief takes — a
      reasonable bound on "how long should this take to model" and no business
      being a bound on when a host may schedule their room to end. A group that
      wants to run over a weekend was refused for no reason anyone could see.

      The floor stays: a room whose deadline has already passed opens straight
      into a closed submission window, which is not a schedule, it is a bug.
    */
    const endsAt = new Date(dto.endsAt);
    const minEndsAt = new Date(Date.now() + CHALLENGE_MIN_MINUTES * 60_000);
    if (endsAt < minEndsAt) {
      throw AppException.conflict(
        `The end time must be at least ${CHALLENGE_MIN_MINUTES} minutes from now.`,
      );
    }

    const room = await this.rooms.save(
      this.rooms.create({
        name: dto.name.trim(),
        // Every room gets a code, listed or not: a code is how you invite a
        // specific person, which is orthogonal to whether strangers can find it.
        joinCode: this.generateCode(),
        hostId: host.id,
        categoryId: dto.categoryId ?? null,
        difficulty: dto.difficulty ?? null,
        maxPlayers,
        // Assigned rather than left at the column default. Every room still gets
        // a join code — a listed room is discoverable *and* shareable — but only
        // a public one appears in the browse list.
        visibility: dto.visibility ?? RoomVisibility.PRIVATE,
        endsAt,
        // Informational until Start recomputes it against the real kickoff
        // time — shown in the lobby as "about this long", not a promise.
        durationSeconds: Math.round((endsAt.getTime() - Date.now()) / 1000),
        status: RoomStatus.LOBBY,
      }),
    );

    // The host is a competitor, not a spectator.
    await this.participants.save(
      this.participants.create({ roomId: room.id, userId: host.id }),
    );

    return this.findOrFail(room.id);
  }

  /**
   * Join by id (public) or by code (private).
   *
   * Capacity is checked inside a transaction with a row lock, because two people
   * taking the last seat at the same moment would both read "one seat free"
   * without it.
   */
  async join(user: AuthenticatedUser, opts: { roomId?: string; code?: string }): Promise<Room> {
    const roomId = await this.dataSource.transaction(async (manager) => {
      const query = manager
        .createQueryBuilder(Room, 'room')
        .setLock('pessimistic_write')
        .where(opts.code ? 'room.join_code = :code' : 'room.id = :id', {
          code: opts.code?.toUpperCase(),
          id: opts.roomId,
        });

      const room = await query.getOne();
      if (!room) throw AppException.notFound('Room');

      if (room.status !== RoomStatus.LOBBY) {
        throw AppException.conflict('This room has already started');
      }

      const existing = await manager.findOne(RoomParticipant, {
        where: { roomId: room.id, userId: user.id },
      });

      // Rejoining after leaving is fine while the room is still a lobby.
      if (existing) {
        if (existing.status === RoomParticipantStatus.LEFT) {
          await manager.update(
            RoomParticipant,
            { id: existing.id },
            { status: RoomParticipantStatus.ENTERED },
          );
        }
        return room.id;
      }

      const seated = await manager.count(RoomParticipant, {
        where: {
          roomId: room.id,
          status: In([RoomParticipantStatus.ENTERED, RoomParticipantStatus.SUBMITTED]),
        },
      });

      if (seated >= room.maxPlayers) throw AppException.conflict('This room is full');

      await manager.insert(RoomParticipant, { roomId: room.id, userId: user.id });
      return room.id;
    });

    return this.findOrFail(roomId);
  }

  /**
   * Leave a lobby.
   *
   * The host leaving needs its own handling, because only the host can call
   * `start` and there is no sweep over `LOBBY` rooms. Without a handover, a host
   * who walked away left everyone else in a room that could never begin and
   * never expired — and since rooms are unlisted, the only escape was for each
   * player to leave individually. So the room is handed to the longest-standing
   * remaining player, or cancelled outright when the host was the last one in it.
   */
  async leave(roomId: string, userId: string): Promise<void> {
    const room = await this.findOrFail(roomId);

    if (room.status !== RoomStatus.LOBBY) {
      // Once the clock is running, leaving is just not submitting — handled by
      // the deadline sweep, and never silently erased from the room.
      throw AppException.conflict('The room has started; you can only stop competing');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        RoomParticipant,
        { roomId, userId },
        { status: RoomParticipantStatus.LEFT },
      );

      if (room.hostId !== userId) return;

      const remaining = await manager.find(RoomParticipant, {
        where: {
          roomId,
          status: In([RoomParticipantStatus.ENTERED, RoomParticipantStatus.SUBMITTED]),
        },
        order: { createdAt: 'ASC' },
      });

      // The row for the departing host is updated above inside this same
      // transaction, so it is already excluded — the userId guard is belt and
      // braces against a stale read.
      const heir = remaining.find((participant) => participant.userId !== userId);

      if (heir) {
        await manager.update(Room, { id: roomId }, { hostId: heir.userId });
        return;
      }

      await manager.update(
        Room,
        { id: roomId },
        { status: RoomStatus.CANCELLED, completedAt: new Date() },
      );
    });
  }

  // --- Kickoff ----------------------------------------------------------------

  /**
   * Host starts the room: the server draws the brief and the clocks are fixed.
   *
   * `DRAWING` exists so the reveal has somewhere to live — every client sees the
   * same brief appear at the same moment, and the modelling window opens only
   * once that has played out.
   */
  async start(roomId: string, requesterId: string): Promise<Room> {
    const room = await this.findOrFail(roomId);

    if (room.hostId !== requesterId) {
      throw AppException.forbidden('Only the host can start this room');
    }
    if (room.status !== RoomStatus.LOBBY) {
      throw AppException.conflict('This room has already started');
    }

    const active = room.participants.filter(
      (participant) => participant.status === RoomParticipantStatus.ENTERED,
    );
    if (active.length < ROOM_MIN_PLAYERS) {
      throw AppException.conflict(`A room needs at least ${ROOM_MIN_PLAYERS} players to start`);
    }

    const startsAt = new Date(Date.now() + ROOM_DRAW_SECONDS * 1000);

    // `endsAt` is the absolute deadline the host picked at creation — it does
    // not move. What can and does move is *now*: a lobby can sit open for a
    // while waiting for players, so the window between kickoff and that fixed
    // deadline can have shrunk since it was set. Re-check it here rather than
    // trusting the value creation-time validation already approved.
    const endsAt = room.endsAt;
    if (!endsAt || endsAt.getTime() - startsAt.getTime() < CHALLENGE_MIN_MINUTES * 60_000) {
      // Addressed to the host: the host guard above is the only way in, so this
      // is the one person who can ever read it, and the one who can act on it.
      throw AppException.conflict(
        `Less than ${CHALLENGE_MIN_MINUTES} minutes remain before this room's end time — open a new room with a later deadline.`,
      );
    }

    const challenge = await this.challenges.draw(
      { categoryId: room.categoryId ?? undefined, difficulty: room.difficulty ?? undefined },
      { id: requesterId } as AuthenticatedUser,
    );

    const durationSeconds = Math.round((endsAt.getTime() - startsAt.getTime()) / 1000);

    // Conditional on LOBBY so a double-tap on Start cannot draw twice and move
    // the deadline out from under everyone.
    const claimed = await this.rooms
      .createQueryBuilder()
      .update(Room)
      .set({ status: RoomStatus.DRAWING, challengeId: challenge.id, startsAt, durationSeconds })
      .where('id = :id AND status = :lobby', { id: roomId, lobby: RoomStatus.LOBBY })
      .execute();

    if (!claimed.affected) throw AppException.conflict('This room has already started');

    /*
      Count the play.

      `challenges.times_played` has existed since the challenge tables were
      created, is read by the admin and manager dashboards, and was never
      written by anything — so "most played brief" was permanently empty and
      every manager's total sat at zero however many rooms had used their work.

      Incremented here rather than at room creation because this is the moment a
      brief is actually drawn and modelled against. It also has to be after the
      conditional UPDATE above: a double-tapped Start that failed to claim the
      room must not still count a play.
    */
    await this.challenges.recordPlay(challenge.id);

    // Everyone in the lobby, including the host — the host is a competitor and
    // wants the link as much as anyone.
    await this.notify(
      active.map((participant) => participant.userId),
      {
        type: NotificationType.ROOM_STARTED,
        title: `"${room.name}" has started`,
        body: `The brief is ${challenge.title}. The deadline is fixed — good luck.`,
        link: `/rooms/${roomId}`,
      },
    );

    return this.findOrFail(roomId);
  }

  // --- Submitting -------------------------------------------------------------

  /**
   * Record an entry. Re-submitting before the deadline replaces the previous one.
   *
   * The deadline is checked against the database clock rather than the request
   * time, and re-checked here even though the sweeper also enforces it: a
   * request that started before `ends_at` and arrived after it must still be
   * refused, or a slow upload becomes extra modelling time.
   */
  /**
   * Guard run before any bytes are uploaded.
   *
   * Uploading first and validating after would let a closed room, or someone who
   * is not even competing, burn storage on every rejected request.
   */
  async assertOpenForSubmission(roomId: string, userId: string): Promise<Room> {
    const room = await this.findOrFail(roomId);

    if (room.status !== RoomStatus.ACTIVE) {
      throw AppException.conflict(
        room.status === RoomStatus.LOBBY || room.status === RoomStatus.DRAWING
          ? 'This room has not started yet'
          : 'The deadline has passed',
      );
    }

    if (room.endsAt && room.endsAt.getTime() <= Date.now()) {
      throw AppException.conflict('The deadline has passed');
    }

    const competing = room.participants.some(
      (entry) => entry.userId === userId && entry.status !== RoomParticipantStatus.LEFT,
    );
    if (!competing) throw AppException.forbidden('You are not competing in this room');

    return room;
  }

  async submit(
    roomId: string,
    userId: string,
    assets: { imageUrl: string; workspacePhotoUrl: string },
    notes?: string,
  ): Promise<Submission> {
    const room = await this.findOrFail(roomId);

    if (room.status !== RoomStatus.ACTIVE) {
      throw AppException.conflict(
        room.status === RoomStatus.VOTING || room.status === RoomStatus.COMPLETED
          ? 'The deadline has passed'
          : 'This room has not started yet',
      );
    }

    if (room.endsAt && room.endsAt.getTime() <= Date.now()) {
      throw AppException.conflict('The deadline has passed');
    }

    const participant = room.participants.find(
      (entry) => entry.userId === userId && entry.status !== RoomParticipantStatus.LEFT,
    );
    if (!participant) throw AppException.forbidden('You are not competing in this room');

    const existing = await this.submissions.findOne({
      where: { participantId: participant.id },
    });

    if (existing) {
      await this.submissions.update(
        { id: existing.id },
        { ...assets, notes: notes ?? null, submittedAt: () => 'now()' },
      );
    } else {
      await this.submissions.insert({
        roomId,
        participantId: participant.id,
        userId,
        ...assets,
        notes: notes ?? null,
      });
    }

    await this.participants.update(
      { id: participant.id },
      { status: RoomParticipantStatus.SUBMITTED },
    );

    const saved = await this.submissions.findOne({ where: { participantId: participant.id } });
    if (!saved) throw AppException.notFound('Submission');
    return saved;
  }

  // --- Deadline ---------------------------------------------------------------

  /**
   * Bring a room up to the phase its own timestamps say it should be in.
   *
   * This is the difference between a room being correct and a room being
   * correct *only while a background process happens to be awake*.
   *
   * Every deadline here is already a stored absolute instant, so the phase a
   * room belongs in is a pure function of those timestamps and the current
   * time — exactly the way public challenges compute `phaseOf` on read. Rooms
   * stored `status` instead and relied on a sweeper to move it, which meant the
   * flagship feature's correctness depended on a process being alive at a
   * specific wall-clock moment. On hosting that sleeps after fifteen minutes
   * idle, that is not an operational annoyance: the deadline passes, nothing
   * moves, and every player sits watching a timer at 0:00 in a room that will
   * never advance.
   *
   * Called on read, so the people who care about the transition are the ones
   * who trigger it. A sleeping API wakes on their first request and advances
   * the room correctly, because a stored deadline does not care how late it is
   * read. The sweeper still runs — it now handles the case where *nobody* is
   * looking (abandoned rooms) rather than being the only thing that works.
   *
   * Safe to call concurrently. Every transition below is a conditional
   * `UPDATE ... WHERE status = :from`, so of any number of simultaneous callers
   * exactly one wins each step and the rest observe the result.
   */
  async reconcile(roomId: string): Promise<Room> {
    let room = await this.findOrFail(roomId);

    /*
      A loop, not a single step, because a room can be several phases behind.
      A room whose players all closed their tabs over lunch may need to go
      DRAWING → ACTIVE → VOTING → COMPLETED on one page load, and stopping
      after one transition would leave it stuck one phase short with nothing
      scheduled to finish the job.

      Bounded so a transition that somehow fails to change the status cannot
      spin: there are only four hops from the earliest live phase to the last.
    */
    for (let step = 0; step < 4; step += 1) {
      const advanced = await this.advanceIfDue(room);
      if (!advanced) return room;
      room = advanced;
    }

    return room;
  }

  /**
   * One phase hop, if this room's current deadline has passed.
   *
   * Returns the updated room, or null when the room is either not due or was
   * advanced by somebody else first — both of which mean the caller should
   * stop.
   */
  private async advanceIfDue(room: Room): Promise<Room | null> {
    const now = Date.now();
    const elapsed = (deadline: Date | null | undefined) =>
      Boolean(deadline && deadline.getTime() <= now);

    if (room.status === RoomStatus.DRAWING && elapsed(room.startsAt)) {
      return this.beginModelling(room.id);
    }

    if (room.status === RoomStatus.ACTIVE && elapsed(room.endsAt)) {
      return this.closeSubmissions(room.id);
    }

    const voting = room.status === RoomStatus.VOTING || room.status === RoomStatus.RUNOFF;
    if (voting && elapsed(room.votingEndsAt)) {
      return this.finalise(room.id);
    }

    return null;
  }

  /**
   * The reveal is over; the modelling clock starts.
   *
   * Lived inline in the scheduler until the same transition was needed on read.
   * Two copies of a conditional update is two places for the guard to be got
   * wrong, and the guard is the only thing making concurrent advancement safe.
   */
  async beginModelling(roomId: string): Promise<Room | null> {
    const claimed = await this.rooms
      .createQueryBuilder()
      .update(Room)
      .set({ status: RoomStatus.ACTIVE })
      .where('id = :id AND status = :drawing', { id: roomId, drawing: RoomStatus.DRAWING })
      .execute();

    if (!claimed.affected) return null;
    return this.findOrFail(roomId);
  }

  /**
   * Close the modelling window: eliminate non-submitters and open the ballot.
   *
   * Elimination carries no XP penalty and no loss on record. Someone who ran out
   * of time simply is not on the ballot — punishing the attempt would only teach
   * people not to enter rooms they might not finish.
   */
  async closeSubmissions(roomId: string): Promise<Room | null> {
    const claimed = await this.rooms
      .createQueryBuilder()
      .update(Room)
      .set({
        status: RoomStatus.VOTING,
        votingEndsAt: () => `now() + interval '${VOTE_WINDOW_SECONDS} seconds'`,
      })
      .where('id = :id AND status = :active', { id: roomId, active: RoomStatus.ACTIVE })
      .execute();

    if (!claimed.affected) return null;

    await this.participants
      .createQueryBuilder()
      .update(RoomParticipant)
      .set({ status: RoomParticipantStatus.ELIMINATED })
      .where('room_id = :roomId AND status = :entered', {
        roomId,
        entered: RoomParticipantStatus.ENTERED,
      })
      .execute();

    const submitted = await this.submissions.count({ where: { roomId } });

    // Nothing to judge. Cancelled rather than completed, so no result is written
    // to anyone's record.
    if (submitted === 0) {
      await this.rooms.update({ id: roomId }, {
        status: RoomStatus.CANCELLED,
        completedAt: new Date(),
      });
      return this.findOrFail(roomId);
    }

    /*
      Whether this room counts is decided here, once, and stored.

      Two things were wrong with the previous rule. It required
      `visibility === PUBLIC`, and nothing ever assigned `visibility`, so the
      clause was tautologically true and looked like a control while enforcing
      nothing. And the floor it used was `ROOM_MIN_PLAYERS` — two — while
      `ROOM_RANKED_MIN_SUBMISSIONS` sat unimported in the shared constants with
      a comment explaining that four is the number which stops a private group
      minting rank by trading likes. Two friends could rank each other all
      afternoon.

      The floor is now the constant that documents it. Visibility is gone from
      the condition on purpose: a private room of four artists who each did the
      work is a real contest, and a public one of two is not, so discoverability
      was never the thing that made a result trustworthy — the number of people
      who actually submitted is.

      Stored rather than recomputed at read time, so a finished room's history
      cannot change meaning if the threshold is ever retuned. Counted from real
      submissions rather than joins: padding a room with idle accounts must not
      clear the bar.
    */
    await this.rooms.update(
      { id: roomId },
      { isRanked: submitted >= ROOM_RANKED_MIN_SUBMISSIONS },
    );

    const room = await this.findOrFail(roomId);

    // Only the people who may actually vote. Telling an eliminated player the
    // ballot is open would be an invitation to a room that will refuse them.
    await this.notify(
      room.participants
        .filter((participant) => participant.status === RoomParticipantStatus.SUBMITTED)
        .map((participant) => participant.userId),
      {
        type: NotificationType.ROOM_VOTING_OPEN,
        title: `Voting is open in "${room.name}"`,
        body: 'A blind ballot — shuffled, timed, and no names. A few minutes to judge.',
        link: `/rooms/${roomId}`,
      },
    );

    return room;
  }

  // --- Results ----------------------------------------------------------------

  /**
   * Close voting: tally, break ties, and write the result.
   *
   * Called for both the main ballot and the runoff. The difference is only which
   * round's likes are counted and what happens on a tie — the main ballot can
   * escalate to a runoff, the runoff cannot escalate again and falls back to the
   * earliest submission. A tie-break that can loop is not a tie-break.
   */
  async finalise(roomId: string): Promise<Room | null> {
    const room = await this.findOrFail(roomId);
    const isRunoff = room.status === RoomStatus.RUNOFF;

    if (room.status !== RoomStatus.VOTING && !isRunoff) return null;

    const round = isRunoff ? 1 : 0;

    // Tally from the likes table rather than trusting a counter: this runs once
    // per room, so the COUNT is cheap, and it is the number people are scored on.
    const tallies = await this.dataSource
      .createQueryBuilder()
      .select('s.participant_id', 'participantId')
      .addSelect('COUNT(l.id)', 'likes')
      .addSelect('s.submitted_at', 'submittedAt')
      .from(Submission, 's')
      .leftJoin(
        'submission_likes',
        'l',
        'l.submission_id = s.id AND l.round = :round AND l.active = true',
        { round },
      )
      .where('s.room_id = :roomId AND s.is_hidden = false', { roomId })
      .groupBy('s.participant_id')
      .addGroupBy('s.submitted_at')
      .getRawMany<{ participantId: string; likes: string; submittedAt: Date }>();

    if (tallies.length === 0) {
      await this.rooms.update({ id: roomId }, {
        status: RoomStatus.CANCELLED,
        completedAt: new Date(),
      });
      return this.findOrFail(roomId);
    }

    const base = tallies.map((row) => ({
      participantId: row.participantId,
      likes: Number(row.likes),
      submittedAt: new Date(row.submittedAt).getTime(),
    }));

    /*
      In a runoff, only the entries that actually tied for the lead are on the
      ballot — `BallotService.eligibleEntries` filters to them. The tally above
      cannot: it reads every submission in the room, because that is the query
      the main ballot needs.

      Ranking that unfiltered list by runoff picks was the bug. A runoff nobody
      voted in leaves every entry on zero, and the sort then falls through to
      "earliest submission in the whole room" — which can hand the win to
      somebody who was never tied and had already placed below the leaders. The
      contenders are therefore separated out and ranked among themselves, and
      everyone else keeps their main-ballot standing underneath them, so the
      winner can only ever come from the cohort that earned the runoff.
    */
    let scored: typeof base;
    let runoffCohort: Set<string> | null = null;

    if (isRunoff) {
      const roster = await this.participants.find({ where: { roomId } });
      const topMain = Math.max(...roster.map((entry) => entry.likeCount));
      const mainLikes = new Map(roster.map((entry) => [entry.id, entry.likeCount]));
      runoffCohort = new Set(
        roster.filter((entry) => entry.likeCount === topMain).map((entry) => entry.id),
      );

      const contenders = base
        .filter((entry) => runoffCohort!.has(entry.participantId))
        .sort((a, b) => b.likes - a.likes || a.submittedAt - b.submittedAt);

      const rest = base
        .filter((entry) => !runoffCohort!.has(entry.participantId))
        .sort(
          (a, b) =>
            (mainLikes.get(b.participantId) ?? 0) - (mainLikes.get(a.participantId) ?? 0) ||
            a.submittedAt - b.submittedAt,
        );

      scored = [...contenders, ...rest];
    } else {
      scored = [...base].sort((a, b) => b.likes - a.likes || a.submittedAt - b.submittedAt);
    }

    const topLikes = scored[0]!.likes;
    const tiedAtTop = scored.filter((entry) => entry.likes === topLikes);

    /*
      A tie at the top on the main ballot goes to a runoff: the tied entries are
      shown together and each voter makes a single pick. Only escalate once — a
      runoff that could itself escalate would never terminate — and only when
      there is something to separate, so a single entry never triggers one.
    */
    if (!isRunoff && tiedAtTop.length > 1 && scored.length > 1) {
      const claimed = await this.rooms
        .createQueryBuilder()
        .update(Room)
        .set({
          status: RoomStatus.RUNOFF,
          votingEndsAt: () => `now() + interval '${VOTE_WINDOW_SECONDS} seconds'`,
        })
        .where('id = :id AND status = :voting', { id: roomId, voting: RoomStatus.VOTING })
        .execute();

      if (claimed.affected) {
        await this.persistLikeCounts(scored);
        return this.findOrFail(roomId);
      }
    }

    await this.persistLikeCounts(scored, isRunoff, runoffCohort);
    await this.writePlacements(room, scored, isRunoff, runoffCohort);

    await this.rooms.update({ id: roomId }, {
      status: RoomStatus.COMPLETED,
      completedAt: new Date(),
    });

    const finished = await this.findOrFail(roomId);

    // Sent after the result is committed, so a notification can never announce
    // an outcome that a failed rollup then rolls back. Only the people who
    // placed — an eliminated player has no result to read.
    await this.notify(
      finished.participants
        .filter((participant) => participant.placement !== null)
        .map((participant) => participant.userId),
      {
        type: NotificationType.ROOM_RESULT,
        title: `"${finished.name}" is finished`,
        body: 'The votes are in and the entries are no longer anonymous.',
        link: `/rooms/${roomId}`,
      },
    );

    return finished;
  }

  private async persistLikeCounts(
    scored: Array<{ participantId: string; likes: number }>,
    isRunoff = false,
    runoffCohort: Set<string> | null = null,
  ): Promise<void> {
    for (const entry of scored) {
      // Only the cohort actually on the runoff ballot gets a runoff tally.
      // Writing zero for everyone else would claim they stood in a round they
      // were never shown in.
      if (isRunoff && runoffCohort && !runoffCohort.has(entry.participantId)) continue;

      await this.participants.update(
        { id: entry.participantId },
        isRunoff ? { runoffVotes: entry.likes } : { likeCount: entry.likes },
      );
    }
  }

  /**
   * Assign placement and result, then roll both up to the user record.
   *
   * XP is awarded only in ranked rooms. Everyone who submitted places; the
   * eliminated are left with a null placement and no result, which is the
   * "neutral no-show" rule — running out of time costs the win, not the record.
   *
   * The rollup is the half that was missing. `result` was being written to the
   * participant and then going nowhere: no profile, leaderboard or achievement
   * reads that column, so every account sat at zero battles and zero XP however
   * many rooms it had won. One transaction, so a room cannot half-credit its
   * players if this fails partway.
   */
  private async writePlacements(
    room: Room,
    scored: Array<{ participantId: string; likes: number; submittedAt: number }>,
    isRunoff: boolean,
    runoffCohort: Set<string> | null = null,
  ): Promise<void> {
    const winnerId = scored[0]!.participantId;

    await this.dataSource.transaction(async (manager) => {
      for (const [index, entry] of scored.entries()) {
        const isWinner = entry.participantId === winnerId;
        // A shared top score only survives here when the runoff also tied, in
        // which case the earliest submission has already won the sort above.
        const result = isWinner ? BattleResult.WIN : BattleResult.LOSS;
        const xp = room.isRanked ? this.xpFor(index) : 0;

        const inRunoff = isRunoff && (!runoffCohort || runoffCohort.has(entry.participantId));

        await manager.update(
          RoomParticipant,
          { id: entry.participantId },
          {
            placement: index + 1,
            result,
            xpAwarded: xp,
            ...(inRunoff ? { runoffVotes: entry.likes } : {}),
          },
        );

        const participant = await manager.findOne(RoomParticipant, {
          where: { id: entry.participantId },
        });
        if (!participant) continue;

        /*
          One statement, not a column at a time.

          `chk_users_battles_consistent` asserts total_battles = wins + losses +
          draws, and a row CHECK is evaluated after every statement — so
          incrementing total_battles and then wins leaves the row invalid in
          between and the first UPDATE is rejected outright. Everything the
          result touches therefore moves together.

          Computing from the stored columns rather than a value read earlier also
          means two rooms finishing at once cannot lose each other's increments.
          Votes received uses the main-ballot tally: in a runoff `entry.likes`
          counts only the second round.
        */
        /*
          XP and score are different currencies and are no longer the same
          number.

          XP is cumulative and never falls — it measures how much you have done.
          Score is a standing and must be able to go down, or the leaderboard
          becomes a ranking of who has entered the most rooms rather than who
          wins them, and a player could climb it by losing repeatedly.

          Floored at zero so a run of losses cannot put someone below a player
          who has never competed, which would read as a punishment for taking
          part.
        */
        const scoreDelta = room.isRanked ? (isWinner ? SCORE_WIN : SCORE_LOSS) : 0;

        await manager.query(
          `UPDATE users
              SET total_battles        = total_battles + 1,
                  wins                 = wins + $2,
                  losses               = losses + $3,
                  total_votes_received = total_votes_received + $4,
                  total_xp             = total_xp + $5,
                  score                = GREATEST(0, score + $6),
                  current_streak       = CASE WHEN $2 = 1 THEN current_streak + 1 ELSE 0 END,
                  highest_streak       = CASE WHEN $2 = 1
                                              THEN GREATEST(highest_streak, current_streak + 1)
                                              ELSE highest_streak END
            WHERE id = $1`,
          [
            participant.userId,
            isWinner ? 1 : 0,
            isWinner ? 0 : 1,
            Math.max(0, participant.likeCount),
            xp,
            scoreDelta,
          ],
        );
      }
    });
  }

  /**
   * Tell people something happened in their room.
   *
   * Every call is wrapped, because a notification is an aside: the room has
   * already advanced by the time this runs, and a failure to write a row saying
   * so must never roll back or interrupt the transition that actually matters.
   * The bell being wrong is a nuisance; a room stuck in the wrong phase is not.
   */
  private async notify(
    userIds: string[],
    notice: { type: NotificationType; title: string; body?: string; link: string },
  ): Promise<void> {
    if (userIds.length === 0) return;

    try {
      await this.notifications.createMany(
        userIds.map((userId) => ({ userId, ...notice })),
      );
    } catch (error) {
      this.logger.error(`Failed to send room notifications: ${(error as Error).message}`);
    }
  }

  /** Flat, placement-based XP. Bounded so one room cannot mint a rank. */
  private xpFor(index: number): number {
    if (index === 0) return 100;
    if (index === 1) return 60;
    if (index === 2) return 40;
    return 20;
  }

  // --- Reads ------------------------------------------------------------------

  async findOrFail(id: string): Promise<Room> {
    const room = await this.rooms.findOne({ where: { id }, relations: ROOM_RELATIONS });
    if (!room) throw AppException.notFound('Room');
    return room;
  }

  /**
   * The viewer's own entry in this room, if they have one.
   *
   * Scoped to the one user by construction — the room screen shows it back so
   * replacing an entry is an informed choice, and anyone else's render during
   * the modelling window is precisely what the blind ballot exists to withhold.
   */
  async mySubmission(roomId: string, userId: string): Promise<Submission | null> {
    return this.submissions.findOne({ where: { roomId, userId } });
  }

  /**
   * Rooms anyone may join, newest first.
   *
   * Until this existed a room was reachable only by someone handing over a
   * six-character code, which put the product in an odd position: every
   * structural defence in this file assumes adversarial strangers — a host who
   * would pre-read the brief, a player who would peek at rivals, an account
   * farmed to swing a vote — while the only way in was a personal invitation.
   * Airport security for a dinner party.
   *
   * Lobbies only. A room that has started cannot be joined, so listing one
   * would be advertising a door that is already shut; the player's own live
   * room is served by `findActiveForUser` instead.
   *
   * Backed by `idx_rooms_visibility_status`, which has been on the table since
   * rooms were built and had nothing to serve because `visibility` was never
   * assigned.
   */
  async listPublicLobbies(limit = 30): Promise<Room[]> {
    return this.rooms
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.host', 'host')
      .leftJoinAndSelect('room.category', 'category')
      .leftJoinAndSelect('room.participants', 'participant')
      .where('room.visibility = :visibility', { visibility: RoomVisibility.PUBLIC })
      .andWhere('room.status = :status', { status: RoomStatus.LOBBY })
      // A lobby whose deadline has already passed can never produce a real
      // modelling window, so it is not joinable in practice — `start` would
      // refuse it. Hiding it here saves someone joining a dead room.
      .andWhere('room.ends_at > now()')
      /*
        The entity property, not the column.

        `take` makes TypeORM build a distinct-id subquery and re-derive the sort
        from the select list, and that step looks the ordering term up in the
        entity metadata — a raw column name is not found there and it dereferences
        undefined. The other query builders in this file order by raw column names
        safely only because none of them paginate.
      */
      .orderBy('room.createdAt', 'DESC')
      .take(limit)
      .getMany();
  }

  /** The room this player is currently in, so a refresh lands back in it. */
  async findActiveForUser(userId: string): Promise<Room | null> {
    return this.rooms
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.challenge', 'challenge')
      .leftJoinAndSelect('room.participants', 'participant')
      .where('room.status IN (:...live)', {
        live: [RoomStatus.LOBBY, RoomStatus.DRAWING, RoomStatus.ACTIVE, RoomStatus.VOTING, RoomStatus.RUNOFF],
      })
      .andWhere(
        `EXISTS (
           SELECT 1 FROM room_participants rp
           WHERE rp.room_id = room.id AND rp.user_id = :userId AND rp.status <> 'left'
         )`,
        { userId },
      )
      .orderBy('room.created_at', 'DESC')
      .getOne();
  }

  /**
   * A join code with no ambiguous glyphs.
   *
   * Codes get read aloud and retyped, so O/0 and I/1 are left out of the
   * alphabet entirely rather than relying on the reader to guess.
   */
  private generateCode(): string {
    let code = '';
    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    }
    return code;
  }
}
