import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { LeaderboardEntry } from '@bb/shared';
import { Repository } from 'typeorm';

import { User } from '@/modules/users/entities/user.entity';

/**
 * The standings.
 *
 * This is the piece whose absence made everything else pointless. Rooms draw a
 * brief the host cannot see, strip authors out of the ballot server-side, refuse
 * self-votes, enforce a per-entry timer, and freeze a deadline nobody can move —
 * an elaborate apparatus for protecting the integrity of a result. Then `rank`
 * was hardcoded `null`, XP bought nothing, and winning returned a number that
 * was never displayed. Nobody would cheat to win that, which meant none of the
 * defences were doing any work.
 *
 * ## Why Postgres and not Redis
 *
 * A `LEADERBOARD_KEY` sorted set was specified for this and never built. It is
 * not what this uses, for three reasons:
 *
 *  - `idx_users_score_desc` on `(score DESC, id)` already exists, so both
 *    queries below are index-backed and neither scans.
 *  - A sorted set is a cache of a column, and caches drift. Every write to
 *    `users.score` would have to remember to mirror itself, and a missed mirror
 *    produces standings that are wrong in a way nothing detects.
 *  - Redis here is explicitly the disposable store — locks and denylists, all
 *    of which degrade harmlessly if flushed. Standings do not degrade
 *    harmlessly, so they live where the durable data lives.
 */
@Injectable()
export class LeaderboardService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /**
   * Where one player stands, or null if they are not ranked yet.
   *
   * Unranked is a real state, not zero: a new account has not lost, it has not
   * played. Showing it as last place would be a false statement about someone
   * who has done nothing wrong, so the profile shows no rank at all until there
   * is a result behind it.
   *
   * Counting players above is an index range scan, where `RANK() OVER ()` would
   * sort every user to answer a question about one of them.
   */
  async rankOf(user: Pick<User, 'id' | 'score' | 'totalBattles'>): Promise<number | null> {
    if (user.totalBattles === 0) return null;

    const { count } = await this.rankedQuery()
      .select('count(*)', 'count')
      .andWhere('user.score > :score', { score: user.score })
      .getRawOne<{ count: string }>() as { count: string };

    return Number(count) + 1;
  }

  /** One page of the standings, best first. */
  async top(limit = 50, offset = 0): Promise<LeaderboardEntry[]> {
    const rows = await this.rankedQuery()
      // `id` as the tiebreaker, matching the index, so two players on the same
      // score keep a stable order between pages rather than swapping around and
      // appearing twice or not at all.
      .orderBy('user.score', 'DESC')
      .addOrderBy('user.id', 'ASC')
      .take(Math.min(limit, 100))
      .skip(offset)
      .getMany();

    return rows.map((user, index) => ({
      rank: offset + index + 1,
      userId: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      score: user.score,
      totalXp: user.totalXp,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      // A computed getter on the entity, so the same rounding rule is used here
      // and on the profile rather than two that drift.
      winRate: user.winRate,
      currentStreak: user.currentStreak,
    }));
  }

  /**
   * Who is eligible to appear at all.
   *
   * Banned and suspended accounts are excluded rather than merely hidden from
   * the page: if they counted, the count-above used for `rankOf` would include
   * them and every honest player below a banned account would be shown a rank
   * one worse than the standings actually display.
   */
  private rankedQuery() {
    return this.users
      .createQueryBuilder('user')
      .where('user.deletedAt IS NULL')
      .andWhere('user.status = :active', { active: 'active' })
      .andWhere('user.totalBattles > 0');
  }
}
