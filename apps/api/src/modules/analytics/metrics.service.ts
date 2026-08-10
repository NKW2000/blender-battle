import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { AdminMetrics, ManagerMetrics } from '@bb/shared';
import { DataSource } from 'typeorm';

import { RedisService } from '@/modules/redis/redis.service';

const SNAPSHOT_KEY = 'metrics:admin:snapshot';
const SNAPSHOT_LOCK = 'metrics:admin:lock';
/** Served for this long; the refresh interval is shorter so it never expires cold. */
const SNAPSHOT_TTL_SECONDS = 600;

/**
 * Admin and manager analytics.
 *
 * The admin overview aggregates across users, rooms, entries and votes — exactly
 * the queries that get slower as the platform succeeds. Running them per
 * dashboard load means every admin refresh scans the largest tables in the
 * system, and several admins with the page open turn that into sustained load.
 *
 * So the snapshot is computed on a schedule, cached in Redis, and served from
 * there with a `generatedAt` stamp. Readers see numbers that are minutes old and
 * are told so, which is the correct trade for a dashboard: nobody makes a
 * decision on a five-minute-old signup count that they would not make on a live one.
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  /** Cached snapshot, computing one on demand if the cache is cold. */
  async adminMetrics(): Promise<AdminMetrics> {
    const cached = await this.redis.client.get(SNAPSHOT_KEY);
    if (cached) return JSON.parse(cached) as AdminMetrics;

    const snapshot = await this.computeAdminSnapshot();
    await this.redis.setWithTtl(SNAPSHOT_KEY, JSON.stringify(snapshot), SNAPSHOT_TTL_SECONDS);
    return snapshot;
  }

  /**
   * Refreshes the snapshot on a schedule, under a lock so that with several API
   * instances only one pays for the aggregation.
   *
   * Five minutes: long enough that the cost is negligible, short enough that the
   * dashboard never feels stale. The TTL is longer than this interval so a
   * missed tick degrades to a slightly older number rather than a cache miss
   * storm.
   */
  @Interval(5 * 60 * 1000)
  async refreshSnapshot(): Promise<void> {
    const token = Math.random().toString(36).slice(2);
    const acquired = await this.redis.client.set(SNAPSHOT_LOCK, token, 'EX', 120, 'NX');
    if (!acquired) return;

    try {
      const snapshot = await this.computeAdminSnapshot();
      await this.redis.setWithTtl(
        SNAPSHOT_KEY,
        JSON.stringify(snapshot),
        SNAPSHOT_TTL_SECONDS,
      );
    } catch (error) {
      // A failed refresh leaves the previous snapshot in place, which is exactly
      // what should happen — stale numbers beat a broken dashboard.
      this.logger.error(`Metrics refresh failed: ${(error as Error).message}`);
    } finally {
      const current = await this.redis.client.get(SNAPSHOT_LOCK);
      if (current === token) await this.redis.client.del(SNAPSHOT_LOCK);
    }
  }

  private async computeAdminSnapshot(): Promise<AdminMetrics> {
    const started = Date.now();

    // One round trip per group rather than per metric. Postgres computes all the
    // counts in a single pass over each table using FILTER.
    const [userStats] = await this.dataSource.query(`
      SELECT
        count(*)::int                                                        AS total,
        count(*) FILTER (WHERE role = 'player')::int                         AS players,
        count(*) FILTER (WHERE role = 'manager')::int                        AS managers,
        count(*) FILTER (WHERE role = 'admin')::int                          AS admins,
        count(*) FILTER (WHERE status = 'banned')::int                       AS banned,
        count(*) FILTER (WHERE status = 'suspended')::int                    AS suspended,
        count(*) FILTER (WHERE last_seen_at > now() - interval '5 minutes')::int  AS online,
        count(*) FILTER (WHERE created_at > now() - interval '7 days')::int  AS new_last_7d,
        count(*) FILTER (WHERE last_seen_at > now() - interval '1 day')::int  AS dau,
        count(*) FILTER (WHERE last_seen_at > now() - interval '7 days')::int AS wau,
        count(*) FILTER (WHERE last_seen_at > now() - interval '30 days')::int AS mau
      FROM users
      WHERE deleted_at IS NULL
    `);

    const [challengeStats] = await this.dataSource.query(`
      SELECT
        count(*)::int                                          AS total,
        count(*) FILTER (WHERE status = 'published')::int       AS published,
        count(*) FILTER (WHERE status = 'draft')::int           AS draft,
        count(*) FILTER (WHERE status = 'archived')::int        AS archived
      FROM challenges
      WHERE deleted_at IS NULL
    `);

    /*
      Rooms, not battles.

      Everything in this block used to read `battles`, `votes` and `reactions` —
      tables created for a matchmaking feature that rooms replaced and that
      nothing has written to since. The dashboard was not reporting a quiet
      week; it was reporting a number that could never move, with no way for a
      reader to tell the difference. Dead schema nothing reads is free; dead
      schema the analytics layer reports on is a lie you eventually believe.
    */
    const [contestStats] = await this.dataSource.query(`
      SELECT
        count(*)::int                                                      AS total,
        count(*) FILTER (WHERE status = 'completed')::int                  AS completed,
        count(*) FILTER (WHERE status IN
          ('lobby','drawing','active','voting','runoff'))::int             AS live,
        count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS last_24h
      FROM rooms
    `);

    // Both ballots count. A challenge vote and a room like are different
    // mechanics, but "how much voting happened" is one question.
    const [voteCount] = await this.dataSource.query(`
      SELECT (
        (SELECT count(*) FROM challenge_votes)
        + (SELECT count(*) FROM submission_likes WHERE active = true)
      )::int AS c
    `);

    const [entryCount] = await this.dataSource.query(`
      SELECT (
        (SELECT count(*) FROM challenge_entries WHERE is_hidden = false)
        + (SELECT count(*) FROM submissions WHERE is_hidden = false)
      )::int AS c
    `);

    const mostPlayed = await this.dataSource.query(`
      SELECT id, title, times_played::int AS times_played
      FROM challenges
      WHERE times_played > 0 AND deleted_at IS NULL
      ORDER BY times_played DESC
      LIMIT 1
    `);

    const trending = await this.dataSource.query(`
      SELECT c.id, c.name, count(r.id)::int AS contests
      FROM categories c
      JOIN challenges ch ON ch.category_id = c.id
      JOIN rooms r ON r.challenge_id = ch.id
      WHERE r.created_at > now() - interval '7 days'
      GROUP BY c.id, c.name
      ORDER BY contests DESC
      LIMIT 5
    `);

    const topPlayers = await this.dataSource.query(`
      SELECT id AS user_id, username, score::int, wins::int
      FROM users
      WHERE deleted_at IS NULL AND status = 'active' AND total_battles > 0
      ORDER BY score DESC, wins DESC
      LIMIT 5
    `);

    // generate_series so days with no activity appear as zero rather than being
    // missing — a chart that silently skips empty days misreports the trend.
    const contestsPerDay = await this.dataSource.query(`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date, count(r.id)::int AS contests
      FROM generate_series(
        date_trunc('day', now()) - interval '13 days',
        date_trunc('day', now()),
        interval '1 day'
      ) AS d(day)
      LEFT JOIN rooms r
        ON r.status = 'completed' AND date_trunc('day', r.completed_at) = d.day
      GROUP BY d.day
      ORDER BY d.day
    `);

    const signupsPerDay = await this.dataSource.query(`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date, count(u.id)::int AS signups
      FROM generate_series(
        date_trunc('day', now()) - interval '13 days',
        date_trunc('day', now()),
        interval '1 day'
      ) AS d(day)
      LEFT JOIN users u ON date_trunc('day', u.created_at) = d.day
      GROUP BY d.day
      ORDER BY d.day
    `);

    this.logger.log(`Admin metrics snapshot computed in ${Date.now() - started}ms`);

    return {
      generatedAt: new Date().toISOString(),
      users: {
        total: userStats.total,
        byRole: {
          player: userStats.players,
          manager: userStats.managers,
          admin: userStats.admins,
        },
        banned: userStats.banned,
        suspended: userStats.suspended,
        online: userStats.online,
        newLast7Days: userStats.new_last_7d,
      },
      challenges: {
        total: challengeStats.total,
        published: challengeStats.published,
        draft: challengeStats.draft,
        archived: challengeStats.archived,
      },
      contests: {
        total: contestStats.total,
        completed: contestStats.completed,
        live: contestStats.live,
        last24h: contestStats.last_24h,
      },
      engagement: {
        totalVotes: voteCount.c,
        totalEntries: entryCount.c,
        dau: userStats.dau,
        wau: userStats.wau,
        mau: userStats.mau,
      },
      mostPlayedChallenge: mostPlayed[0]
        ? {
            id: mostPlayed[0].id,
            title: mostPlayed[0].title,
            timesPlayed: mostPlayed[0].times_played,
          }
        : null,
      trendingCategories: trending.map((row: { id: string; name: string; contests: number }) => ({
        id: row.id,
        name: row.name,
        contests: row.contests,
      })),
      topPlayers: topPlayers.map(
        (row: { user_id: string; username: string; score: number; wins: number }) => ({
          userId: row.user_id,
          username: row.username,
          score: row.score,
          wins: row.wins,
        }),
      ),
      contestsPerDay,
      signupsPerDay,
    };
  }

  /**
   * A manager's own authoring stats. Scoped to one author and therefore cheap
   * enough to run on request — no snapshot needed.
   */
  async managerMetrics(authorId: string): Promise<ManagerMetrics> {
    const [counts] = await this.dataSource.query(
      `SELECT
         count(*)::int                                     AS total,
         count(*) FILTER (WHERE status = 'published')::int  AS published,
         count(*) FILTER (WHERE status = 'draft')::int      AS draft,
         count(*) FILTER (WHERE status = 'archived')::int   AS archived,
         COALESCE(sum(times_played), 0)::int                AS total_plays
       FROM challenges
       WHERE created_by_id = $1 AND deleted_at IS NULL`,
      [authorId],
    );

    const mostPlayed = await this.dataSource.query(
      `SELECT id, title, slug, times_played::int AS times_played
       FROM challenges
       WHERE created_by_id = $1 AND deleted_at IS NULL
       ORDER BY times_played DESC
       LIMIT 5`,
      [authorId],
    );

    const byCategory = await this.dataSource.query(
      `SELECT c.name, count(ch.id)::int AS challenges
       FROM categories c
       JOIN challenges ch ON ch.category_id = c.id
       WHERE ch.created_by_id = $1 AND ch.deleted_at IS NULL
       GROUP BY c.name
       ORDER BY challenges DESC`,
      [authorId],
    );

    return {
      generatedAt: new Date().toISOString(),
      challenges: {
        total: counts.total,
        published: counts.published,
        draft: counts.draft,
        archived: counts.archived,
      },
      totalPlays: counts.total_plays,
      mostPlayed: mostPlayed.map(
        (row: { id: string; title: string; slug: string; times_played: number }) => ({
          id: row.id,
          title: row.title,
          slug: row.slug,
          timesPlayed: row.times_played,
        }),
      ),
      byCategory,
    };
  }
}
