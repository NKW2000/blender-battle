import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MailModule } from '@/modules/mail/mail.module';
import { User } from '@/modules/users/entities/user.entity';

import { AnalyticsController } from './analytics.controller';
import { LeaderboardService } from './leaderboard.service';
import { MetricsService } from './metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), MailModule],
  controllers: [AnalyticsController],
  providers: [MetricsService, LeaderboardService],
  // Exported because the users module fills in a profile's rank, which is a
  // property of the standings rather than of the user row.
  exports: [MetricsService, LeaderboardService],
})
export class AnalyticsModule {}
