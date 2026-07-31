import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityAction, type ActivityLogEntry, type CursorPage } from '@bb/shared';
import { DataSource, Repository } from 'typeorm';

import { buildPage, decodeCursor, encodeCursor } from '@/common/pagination/cursor';

import { ActivityLog } from './entities/activity-log.entity';

export interface RecordActivityInput {
  action: ActivityAction;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly logs: Repository<ActivityLog>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Fire-and-forget by design: an audit write must never fail the user's actual
   * request. A failure to log is logged and swallowed.
   *
   * If audit completeness ever becomes a compliance requirement, this moves to a
   * durable queue rather than becoming a blocking write.
   */
  async record(input: RecordActivityInput): Promise<void> {
    try {
      await this.logs.save(
        this.logs.create({
          action: input.action,
          actorId: input.actorId ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          metadata: input.metadata ?? {},
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to record activity ${input.action}: ${(error as Error).message}`,
      );
    }
  }

  /** Keyset pagination over (created_at DESC, id DESC) — matches the table index. */
  async list(params: {
    actorId?: string;
    action?: ActivityAction;
    cursor?: string;
    limit: number;
  }): Promise<CursorPage<ActivityLog>> {
    const query = this.logs
      .createQueryBuilder('log')
      .orderBy('log.created_at', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .take(params.limit + 1);

    if (params.actorId) {
      query.andWhere('log.actor_id = :actorId', { actorId: params.actorId });
    }
    if (params.action) {
      query.andWhere('log.action = :action', { action: params.action });
    }
    if (params.cursor) {
      const { value, id } = decodeCursor(params.cursor);
      // Row-value comparison: one index-backed seek rather than an OR of ranges.
      query.andWhere('(log.created_at, log.id) < (:createdAt, :id)', {
        createdAt: value,
        id,
      });
    }

    const rows = await query.getMany();
    return buildPage(rows, params.limit, (row) => encodeCursor(row.createdAt, row.id));
  }

  /**
   * The same page with actor usernames attached.
   *
   * Resolved with a second query rather than a JOIN because there is
   * deliberately no foreign key from this table to users — the audit trail has
   * to survive a hard-deleted account. An actor whose row is gone comes back as
   * null, which reads correctly as "this account no longer exists".
   */
  async listWithActors(params: {
    actorId?: string;
    action?: ActivityAction;
    cursor?: string;
    limit: number;
  }): Promise<CursorPage<ActivityLogEntry>> {
    const page = await this.list(params);

    const actorIds = [
      ...new Set(page.items.map((log) => log.actorId).filter((id): id is string => !!id)),
    ];

    const actors = actorIds.length
      ? ((await this.dataSource.query(
          `SELECT id, username FROM users WHERE id = ANY($1::uuid[])`,
          [actorIds],
        )) as Array<{ id: string; username: string }>)
      : [];

    const byId = new Map(actors.map((actor) => [actor.id, actor.username]));

    return {
      items: page.items.map((log) => ({
        id: log.id,
        action: log.action,
        actor:
          log.actorId && byId.has(log.actorId)
            ? { id: log.actorId, username: byId.get(log.actorId) as string }
            : null,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: log.metadata,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}
