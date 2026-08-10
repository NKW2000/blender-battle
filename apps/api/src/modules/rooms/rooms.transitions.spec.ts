import { RoomParticipantStatus, RoomStatus } from '@bb/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { Room } from './entities/room.entity';
import { RoomsService } from './rooms.service';

/**
 * Room phase transitions must happen exactly once.
 *
 * The service guards every one of them with a conditional
 * `UPDATE ... WHERE status = :from`, so a second caller arriving at the same
 * moment updates zero rows and is expected to bail out. That guard is the thing
 * that makes it safe for a scheduler tick, another API instance, and — once
 * advancement is read-driven — any number of concurrent page loads to all try
 * to close the same room at the same instant.
 *
 * It has never been verified. A double-advance would eliminate the same players
 * twice, decide `isRanked` twice, and roll results into user records twice, and
 * none of that surfaces anywhere a person would look.
 *
 * The fakes below model the one property that matters: the compare-and-set is
 * atomic. Nothing may observe the row between reading its status and writing
 * the new one, which is exactly what Postgres guarantees for a single UPDATE
 * and what the whole design leans on.
 */

interface RoomRow {
  id: string;
  status: RoomStatus;
  visibility: string;
  isRanked: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  votingEndsAt: Date | null;
  completedAt: Date | null;
  participants: Array<{ id: string; userId: string; status: RoomParticipantStatus }>;
}

const PAST = new Date('2020-01-01T00:00:00.000Z');
const FUTURE = new Date('2099-01-01T00:00:00.000Z');

/**
 * Applies `.set()` values, evaluating the raw-SQL thunks the service passes.
 *
 * The only thunk used is `now() + interval 'N seconds'`, and the interval has
 * to be honoured rather than collapsed to "now": a ballot deadline that lands
 * in the past the moment it is written would make the room instantly due for
 * finalising, which is the opposite of what the code does and would quietly
 * turn a test of one transition into a test of three.
 */
function applySet(row: Record<string, unknown>, values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'function') {
      row[key] = value;
      continue;
    }

    const seconds = /interval '(\d+) seconds'/.exec(String(value()))?.[1];
    row[key] = new Date(Date.now() + Number(seconds ?? 0) * 1000);
  }
}

function createFakes(initial: Partial<RoomRow> = {}) {
  const room: RoomRow = {
    id: 'room-1',
    status: RoomStatus.ACTIVE,
    visibility: 'public',
    isRanked: false,
    startsAt: PAST,
    endsAt: PAST,
    votingEndsAt: null,
    completedAt: null,
    participants: [
      { id: 'p1', userId: 'u1', status: RoomParticipantStatus.SUBMITTED },
      { id: 'p2', userId: 'u2', status: RoomParticipantStatus.SUBMITTED },
      { id: 'p3', userId: 'u3', status: RoomParticipantStatus.ENTERED },
    ],
    ...initial,
  };

  /** Every conditional UPDATE that ran, so double-advance is observable. */
  const applied: string[] = [];
  /** Notifications produced, so "the bell stays empty" is testable. */
  const notified: Array<{ userId: string; type: string }> = [];
  let submissionCount = 2;

  const roomQueryBuilder = () => {
    let values: Record<string, unknown> = {};
    let expected: RoomStatus | undefined;

    const builder = {
      update: () => builder,
      set: (next: Record<string, unknown>) => {
        values = next;
        return builder;
      },
      where: (_sql: string, params: Record<string, unknown>) => {
        // The service names the expected status differently per transition
        // (`:active`, `:voting`, `:lobby`). Whichever it is, it is the only
        // RoomStatus in the parameter object besides the id.
        expected = Object.entries(params).find(
          ([key, value]) => key !== 'id' && typeof value === 'string',
        )?.[1] as RoomStatus | undefined;
        return builder;
      },
      // Synchronous check-and-set inside one awaited call: the row cannot be
      // read by anyone else between the comparison and the write.
      execute: async () => {
        if (room.status !== expected) return { affected: 0 };
        applySet(room as unknown as Record<string, unknown>, values);
        applied.push(String(values.status));
        return { affected: 1 };
      },
    };

    return builder;
  };

  const participantQueryBuilder = () => {
    let values: Record<string, unknown> = {};
    const builder = {
      update: () => builder,
      set: (next: Record<string, unknown>) => {
        values = next;
        return builder;
      },
      where: () => builder,
      execute: async () => {
        for (const participant of room.participants) {
          if (participant.status === RoomParticipantStatus.ENTERED) {
            participant.status = values.status as RoomParticipantStatus;
          }
        }
        return { affected: 1 };
      },
    };
    return builder;
  };

  const service = new RoomsService(
    {
      createQueryBuilder: roomQueryBuilder,
      update: async (_where: unknown, values: Record<string, unknown>) => {
        applySet(room as unknown as Record<string, unknown>, values);
        return { affected: 1 };
      },
      findOne: async () => room as unknown as Room,
    } as never,
    {
      createQueryBuilder: participantQueryBuilder,
      find: async () => room.participants,
      update: async () => ({ affected: 1 }),
    } as never,
    { count: async () => submissionCount } as never,
    null as never,
    null as never,
    {
      createMany: async (inputs: Array<{ userId: string; type: string }>) => {
        notified.push(...inputs);
      },
    } as never,
  );

  return {
    service,
    room,
    applied,
    notified,
    setSubmissionCount: (count: number) => {
      submissionCount = count;
    },
  };
}

describe('closeSubmissions', () => {
  let fakes: ReturnType<typeof createFakes>;

  beforeEach(() => {
    fakes = createFakes();
  });

  it('advances an active room to voting', async () => {
    await fakes.service.closeSubmissions('room-1');

    expect(fakes.room.status).toBe(RoomStatus.VOTING);
    expect(fakes.room.votingEndsAt).toBeInstanceOf(Date);
  });

  it('eliminates players who never submitted', async () => {
    await fakes.service.closeSubmissions('room-1');

    const statuses = fakes.room.participants.map((participant) => participant.status);
    expect(statuses).toEqual([
      RoomParticipantStatus.SUBMITTED,
      RoomParticipantStatus.SUBMITTED,
      RoomParticipantStatus.ELIMINATED,
    ]);
  });

  it('advances exactly once when two callers race', async () => {
    /*
      The scenario the guard exists for: a scheduler tick and a page load
      hitting the same room in the same instant. Both read ACTIVE, both issue
      the UPDATE, and only the one whose WHERE still matches may proceed.
    */
    const [first, second] = await Promise.all([
      fakes.service.closeSubmissions('room-1'),
      fakes.service.closeSubmissions('room-1'),
    ]);

    // Exactly one transition was applied to the row...
    expect(fakes.applied).toEqual([RoomStatus.VOTING]);

    // ...and the loser reported that it did nothing, rather than returning a
    // room and letting its caller believe it had just closed it.
    expect([first, second].filter((result) => result === null)).toHaveLength(1);
  });

  it('does not eliminate a player twice when two callers race', async () => {
    await Promise.all([
      fakes.service.closeSubmissions('room-1'),
      fakes.service.closeSubmissions('room-1'),
    ]);

    // A second elimination pass would find no ENTERED rows, so the visible
    // damage is bounded — but the ranked decision and the tally that follow it
    // are not idempotent, which is why the loser must stop at the guard.
    expect(
      fakes.room.participants.filter(
        (participant) => participant.status === RoomParticipantStatus.ELIMINATED,
      ),
    ).toHaveLength(1);
  });

  it('refuses to act on a room that is not active', async () => {
    fakes.room.status = RoomStatus.VOTING;

    expect(await fakes.service.closeSubmissions('room-1')).toBeNull();
    expect(fakes.applied).toEqual([]);
  });

  describe('reconcile', () => {
    it('starts the modelling clock once the reveal is over', async () => {
      fakes.room.status = RoomStatus.DRAWING;
      fakes.room.startsAt = PAST;
      fakes.room.endsAt = FUTURE;

      await fakes.service.reconcile('room-1');

      expect(fakes.room.status).toBe(RoomStatus.ACTIVE);
    });

    it('catches a room up through several phases at once', async () => {
      /*
        The scenario this whole mechanism exists for.

        The API was asleep — free-tier hosting idles after fifteen minutes —
        while both the reveal and the modelling deadline passed. The first
        person to load the page must find a room in the phase its timestamps
        say it is in, not a room frozen two phases back showing a timer at
        0:00 with nothing scheduled to move it.
      */
      fakes.room.status = RoomStatus.DRAWING;
      fakes.room.startsAt = PAST;
      fakes.room.endsAt = PAST;

      await fakes.service.reconcile('room-1');

      expect(fakes.applied).toEqual([RoomStatus.ACTIVE, RoomStatus.VOTING]);
      expect(fakes.room.status).toBe(RoomStatus.VOTING);
    });

    it('stops at the phase whose deadline has not yet passed', async () => {
      // Closing submissions opens a ballot with its own future deadline, so
      // the catch-up must stop there rather than running on and finalising a
      // vote nobody has had a chance to cast.
      fakes.room.status = RoomStatus.DRAWING;
      fakes.room.startsAt = PAST;
      fakes.room.endsAt = PAST;

      await fakes.service.reconcile('room-1');

      expect(fakes.room.votingEndsAt!.getTime()).toBeGreaterThan(Date.now());
      expect(fakes.applied).not.toContain(RoomStatus.COMPLETED);
    });

    it('advances once when many readers arrive together', async () => {
      // Advancement on read means concurrency is the normal case, not an edge
      // case: every player polling the room hits this at the same moment.
      fakes.room.status = RoomStatus.DRAWING;
      fakes.room.startsAt = PAST;
      fakes.room.endsAt = FUTURE;

      await Promise.all([
        fakes.service.reconcile('room-1'),
        fakes.service.reconcile('room-1'),
        fakes.service.reconcile('room-1'),
      ]);

      expect(fakes.applied).toEqual([RoomStatus.ACTIVE]);
    });

    it('leaves a lobby alone however long it has sat there', async () => {
      // A lobby has no deadline of its own — it waits for the host to press
      // Start. Nothing about elapsed time may move it.
      fakes.room.status = RoomStatus.LOBBY;
      fakes.room.startsAt = PAST;
      fakes.room.endsAt = PAST;

      await fakes.service.reconcile('room-1');

      expect(fakes.room.status).toBe(RoomStatus.LOBBY);
      expect(fakes.applied).toEqual([]);
    });
  });

  it('does not touch a room whose deadline has not passed', async () => {
    fakes.room.endsAt = FUTURE;

    await fakes.service.reconcile('room-1');

    expect(fakes.room.status).toBe(RoomStatus.ACTIVE);
    expect(fakes.applied).toEqual([]);
  });

  it('tells the people who may vote that the ballot is open', async () => {
    // The notification stack — endpoints, bell, unread count, toasts — was
    // fully built and had no producer, so the bell could only ever be empty.
    await fakes.service.closeSubmissions('room-1');

    expect(fakes.notified.map((notice) => notice.userId)).toEqual(['u1', 'u2']);
    expect(fakes.notified.every((notice) => notice.type === 'room_voting_open')).toBe(true);
  });

  it('does not invite eliminated players to a ballot that will refuse them', async () => {
    // u3 never submitted, so the ballot would return 403. Telling them it was
    // open would be an invitation to a locked door.
    await fakes.service.closeSubmissions('room-1');

    expect(fakes.notified.map((notice) => notice.userId)).not.toContain('u3');
  });

  it('does not rank a room below the anti-collusion floor', async () => {
    /*
      Three friends trading likes must not be able to mint rank. The floor is
      ROOM_RANKED_MIN_SUBMISSIONS (4), counted from real submissions rather
      than from who joined, so padding a room with idle accounts does not clear
      it. Before this, the check was `submitted >= ROOM_MIN_PLAYERS` — two.
    */
    fakes.setSubmissionCount(3);

    await fakes.service.closeSubmissions('room-1');

    expect(fakes.room.isRanked).toBe(false);
  });

  it('ranks a room once enough people actually submitted', async () => {
    fakes.setSubmissionCount(4);

    await fakes.service.closeSubmissions('room-1');

    expect(fakes.room.isRanked).toBe(true);
  });

  it('ranks a private room on the same terms as a listed one', async () => {
    // Whether a result counts is decided by how many people did the work, not
    // by who could find the room. The old rule required `visibility = public`,
    // which nothing ever assigned, so it read as a control and enforced
    // nothing.
    fakes.room.visibility = 'private';
    fakes.setSubmissionCount(4);

    await fakes.service.closeSubmissions('room-1');

    expect(fakes.room.isRanked).toBe(true);
  });

  it('cancels rather than completes when nobody submitted', async () => {
    // Cancelled, so no result is written to anyone's record. A room nobody
    // entered must not put a loss on the board.
    fakes.setSubmissionCount(0);

    await fakes.service.closeSubmissions('room-1');

    expect(fakes.room.status).toBe(RoomStatus.CANCELLED);
    expect(fakes.room.completedAt).toBeInstanceOf(Date);
  });
});
