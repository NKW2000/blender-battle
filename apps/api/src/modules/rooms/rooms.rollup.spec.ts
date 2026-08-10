import { BattleResult, RoomStatus } from '@bb/shared';
import { describe, expect, it } from 'vitest';

import { Room } from './entities/room.entity';
import { RoomsService } from './rooms.service';

/**
 * Writing the result of a room into player records.
 *
 * `chk_users_battles_consistent` asserts `total_battles = wins + losses + draws`
 * and, being a row CHECK, is evaluated after **every statement**. So the rollup
 * cannot increment `total_battles` and then `wins`: the row is invalid between
 * the two and the first UPDATE is rejected outright. Everything a result touches
 * has to move in one statement.
 *
 * That constraint forces one UPDATE per player, which raises the question this
 * file answers: what happens when the fourth of six fails? Two properties are
 * checked — every player's statement is self-consistent, and the whole rollup is
 * one transaction, so a failure credits nobody rather than half the room.
 */

interface UserRow {
  id: string;
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  totalXp: number;
  score: number;
  currentStreak: number;
}

function createFakes(options: { failOnUserId?: string; isRanked?: boolean } = {}) {
  const users = new Map<string, UserRow>(
    ['u1', 'u2', 'u3'].map((id) => [
      id,
      { id, totalBattles: 0, wins: 0, losses: 0, draws: 0, totalXp: 0, score: 0, currentStreak: 0 },
    ]),
  );

  const participants = [
    { id: 'p1', userId: 'u1', likeCount: 5, runoffVotes: 0, placement: null as number | null, result: null as string | null },
    { id: 'p2', userId: 'u2', likeCount: 3, runoffVotes: 0, placement: null as number | null, result: null as string | null },
    { id: 'p3', userId: 'u3', likeCount: 1, runoffVotes: 0, placement: null as number | null, result: null as string | null },
  ];

  const room = {
    id: 'room-1',
    name: 'Test room',
    status: RoomStatus.VOTING,
    isRanked: options.isRanked ?? true,
    completedAt: null as Date | null,
    // The same array the fake participant repository serves, so a placement
    // written through one is visible through the other — which is what decides
    // who gets a result notification.
    participants,
  };

  /** Statements issued inside the transaction, and whether it committed. */
  const statements: Array<{
    userId: string;
    wins: number;
    losses: number;
    xp: number;
    scoreDelta: number;
  }> = [];
  let committed = false;
  /** Notifications produced, so "the bell stays empty" is testable. */
  const notified: Array<{ userId: string; type: string }> = [];

  const manager = {
    update: async (_entity: unknown, where: { id: string }, values: Record<string, unknown>) => {
      const participant = participants.find((entry) => entry.id === where.id);
      if (participant) Object.assign(participant, values);
      return { affected: 1 };
    },
    findOne: async (_entity: unknown, options_: { where: { id: string } }) =>
      participants.find((entry) => entry.id === options_.where.id),
    query: async (_sql: string, parameters: unknown[]) => {
      const [userId, wins, losses, , xp, scoreDelta] = parameters as [
        string,
        number,
        number,
        number,
        number,
        number,
      ];

      if (userId === options.failOnUserId) {
        throw new Error('simulated database failure mid-rollup');
      }

      statements.push({ userId, wins, losses, xp, scoreDelta });

      // The single statement the CHECK constraint sees. Applied all at once,
      // exactly as the real UPDATE does.
      const user = users.get(userId)!;
      user.totalBattles += 1;
      user.wins += wins;
      user.losses += losses;
      user.totalXp += xp;
      // GREATEST(0, ...) in the real statement: a standing may fall but not
      // below someone who has never competed.
      user.score = Math.max(0, user.score + scoreDelta);
      user.currentStreak = wins === 1 ? user.currentStreak + 1 : 0;
      return [];
    },
  };

  const tallyBuilder = {
    select: () => tallyBuilder,
    addSelect: () => tallyBuilder,
    from: () => tallyBuilder,
    leftJoin: () => tallyBuilder,
    where: () => tallyBuilder,
    groupBy: () => tallyBuilder,
    addGroupBy: () => tallyBuilder,
    getRawMany: async () =>
      participants.map((participant, index) => ({
        participantId: participant.id,
        likes: String(participant.likeCount),
        submittedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      })),
  };

  const service = new RoomsService(
    {
      findOne: async () => room as unknown as Room,
      update: async (_where: unknown, values: Record<string, unknown>) => {
        Object.assign(room, values);
        return { affected: 1 };
      },
      createQueryBuilder: () => {
        const builder = {
          update: () => builder,
          set: () => builder,
          where: () => builder,
          execute: async () => ({ affected: 0 }),
        };
        return builder;
      },
    } as never,
    {
      find: async () => participants,
      update: async (where: { id: string }, values: Record<string, unknown>) => {
        const participant = participants.find((entry) => entry.id === where.id);
        if (participant) Object.assign(participant, values);
        return { affected: 1 };
      },
    } as never,
    { count: async () => participants.length } as never,
    null as never,
    {
      createQueryBuilder: () => tallyBuilder,
      transaction: async (work: (m: typeof manager) => Promise<void>) => {
        // Snapshot, so a throw can restore — which is what "the rollup is one
        // transaction" has to mean for it to be worth anything.
        const snapshot = new Map(
          [...users.entries()].map(([id, user]) => [id, { ...user }]),
        );

        try {
          await work(manager);
          committed = true;
        } catch (error) {
          for (const [id, user] of snapshot) users.set(id, user);
          throw error;
        }
      },
    } as never,
    {
      createMany: async (inputs: Array<{ userId: string; type: string }>) => {
        notified.push(...inputs);
      },
    } as never,
  );

  return {
    service,
    users,
    participants,
    room,
    statements,
    notified,
    didCommit: () => committed,
  };
}

describe('finalise — writing results into player records', () => {
  it('credits every player exactly once', async () => {
    const fakes = createFakes();

    await fakes.service.finalise('room-1');

    expect(fakes.statements).toHaveLength(3);
    for (const user of fakes.users.values()) {
      expect(user.totalBattles).toBe(1);
    }
  });

  it('keeps every player row consistent with the CHECK constraint', async () => {
    // total_battles = wins + losses + draws, evaluated after each statement.
    // If the rollup ever splits into several statements per player, this is
    // what notices.
    const fakes = createFakes();

    await fakes.service.finalise('room-1');

    for (const user of fakes.users.values()) {
      expect(user.totalBattles).toBe(user.wins + user.losses + user.draws);
    }
  });

  it('gives the win to the top tally and a loss to everyone else', async () => {
    const fakes = createFakes();

    await fakes.service.finalise('room-1');

    expect(fakes.users.get('u1')).toMatchObject({ wins: 1, losses: 0, currentStreak: 1 });
    expect(fakes.users.get('u2')).toMatchObject({ wins: 0, losses: 1, currentStreak: 0 });
    expect(fakes.participants[0]).toMatchObject({ placement: 1, result: BattleResult.WIN });
    expect(fakes.participants[1]).toMatchObject({ placement: 2, result: BattleResult.LOSS });
  });

  it('credits nobody when a statement fails partway through', async () => {
    /*
      The half-applied rollup. Without one enclosing transaction, u1 would keep
      a win and an XP award while u2 and u3 got nothing — permanently, with no
      compensating write anywhere and no error a user would ever see, because
      the room still shows a winner.
    */
    const fakes = createFakes({ failOnUserId: 'u2' });

    await expect(fakes.service.finalise('room-1')).rejects.toThrow('simulated database failure');

    expect(fakes.didCommit()).toBe(false);
    for (const user of fakes.users.values()) {
      expect(user).toMatchObject({ totalBattles: 0, wins: 0, losses: 0, totalXp: 0, score: 0 });
    }
  });

  it('leaves the room unfinished when the rollup fails', async () => {
    // The room must stay in VOTING so the next sweep retries it. Marking it
    // completed after a failed rollup would strand the result forever.
    const fakes = createFakes({ failOnUserId: 'u2' });

    await expect(fakes.service.finalise('room-1')).rejects.toThrow();

    expect(fakes.room.status).toBe(RoomStatus.VOTING);
    expect(fakes.room.completedAt).toBeNull();
  });

  it('moves the standing up for a win and down for a loss', async () => {
    /*
      Score and XP are different currencies. XP only ever rises — it measures
      how much you have done. A standing that could only rise would rank the
      most prolific entrant rather than the best one, and could be climbed by
      losing repeatedly.
    */
    const fakes = createFakes();

    await fakes.service.finalise('room-1');

    expect(fakes.statements.find((row) => row.userId === 'u1')!.scoreDelta).toBeGreaterThan(0);
    expect(fakes.statements.find((row) => row.userId === 'u2')!.scoreDelta).toBeLessThan(0);
  });

  it('never drops a standing below zero', async () => {
    // Floored, so a run of losses cannot put a player below someone who has
    // never competed — which would read as a penalty for taking part.
    const fakes = createFakes();

    await fakes.service.finalise('room-1');

    for (const user of fakes.users.values()) {
      expect(user.score).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves standings untouched in an unranked room', async () => {
    // Below the anti-collusion floor. The result is still recorded on the
    // record; it just does not move the leaderboard.
    const fakes = createFakes({ isRanked: false });

    await fakes.service.finalise('room-1');

    for (const row of fakes.statements) expect(row.scoreDelta).toBe(0);
  });

  it('awards no XP in an unranked room', async () => {
    // Ranked is decided once, when submissions close. An unranked room still
    // records the win and the loss; it just does not move anyone's total.
    const fakes = createFakes({ isRanked: false });

    await fakes.service.finalise('room-1');

    for (const user of fakes.users.values()) {
      expect(user.totalXp).toBe(0);
      expect(user.totalBattles).toBe(1);
    }
  });
});
