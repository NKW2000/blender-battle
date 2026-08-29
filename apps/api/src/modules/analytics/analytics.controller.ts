import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  Role,
  type AdminMetrics,
  type LeaderboardEntry,
  type ManagerMetrics,
} from '@bb/shared';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { CurrentUser, Public, Roles } from '@/common/decorators';
import type { AuthenticatedUser } from '@/common/types/authenticated-user';
import { MailService } from '@/modules/mail/mail.service';

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


@Controller()
export class AnalyticsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly leaderboard: LeaderboardService,
    private readonly mail: MailService,
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


  /**
   * Does mail actually work.
   *
   * A live handshake, not a reading of the configuration — separate from the
   * cached metrics because it opens a socket, and cached for five minutes it
   * would answer for a state that has since been fixed or broken. Admin-only
   * and rate limited: it authenticates against a third party, so it is not
   * something to let anyone run in a loop.
   */
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Get('admin/mail/check')
  async mailCheck(): Promise<{ ok: boolean; detail: string }> {
    return this.mail.verify();
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

}
