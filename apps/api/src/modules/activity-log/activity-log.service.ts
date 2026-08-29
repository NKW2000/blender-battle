import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityAction } from '@bb/shared';
import { Repository } from 'typeorm';

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
}
