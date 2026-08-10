import { Controller, Get, Query } from '@nestjs/common';
import {
  ActivityAction,
  Role,
  type ActivityLogEntry,
  type AdminMetrics,
  type CursorPage,
  type LeaderboardEntry,
  type ManagerMetrics,
} from '@bb/shared';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { CursorQueryDto } from '@/common/dto/cursor-query.dto';
import { CurrentUser, Public, Roles } from '@/common/decorators';
import type { AuthenticatedUser } from '@/common/types/authenticated-user';
import { ActivityLogService } from '@/modules/activity-log/activity-log.service';

import { LeaderboardService } from './leaderboard.service';
import { MetricsService } from './metrics.service';

class LeaderboardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

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
    private readonly leaderboard: LeaderboardService,
  ) {}

  /**
   * The standings.
   *
   * Public: a leaderboard nobody can see without signing in cannot do the one
   * job a leaderboard has, which is to give a result somewhere to be seen.
   */
  @Public()
  @Get('leaderboard')
  async standings(@Query() query: LeaderboardQueryDto): Promise<LeaderboardEntry[]> {
    return this.leaderboard.top(query.limit ?? 50, query.offset ?? 0);
  }


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
