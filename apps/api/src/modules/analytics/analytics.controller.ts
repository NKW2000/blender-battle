import { Controller, Get, Query } from '@nestjs/common';
import {
  ActivityAction,
  Role,
  type ActivityLogEntry,
  type AdminMetrics,
  type CursorPage,
  type ManagerMetrics,
} from '@bb/shared';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { CursorQueryDto } from '@/common/dto/cursor-query.dto';
import { CurrentUser, Roles } from '@/common/decorators';
import type { AuthenticatedUser } from '@/common/types/authenticated-user';
import { ActivityLogService } from '@/modules/activity-log/activity-log.service';

import { MetricsService } from './metrics.service';

class ActivityQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsEnum(ActivityAction)
  action?: ActivityAction;

  @IsOptional()
  @IsUUID()
  actorId?: string;
}

@Controller()
export class AnalyticsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly activity: ActivityLogService,
  ) {}


  @Roles(Role.ADMIN)
  @Get('admin/metrics')
  async adminMetrics(): Promise<AdminMetrics> {
    return this.metrics.adminMetrics();
  }

  @Roles(Role.MANAGER)
  @Get('manager/metrics')
  async managerMetrics(@CurrentUser() user: AuthenticatedUser): Promise<ManagerMetrics> {
    // Scoped to the caller — a manager sees their own authoring stats, never
    // another manager's.
    return this.metrics.managerMetrics(user.id);
  }

  @Roles(Role.ADMIN)
  @Get('admin/activity')
  async activityLog(
    @Query() query: ActivityQueryDto,
  ): Promise<CursorPage<ActivityLogEntry>> {
    return this.activity.listWithActors({
      action: query.action,
      actorId: query.actorId,
      cursor: query.cursor,
      limit: query.limit,
    });
  }
}
