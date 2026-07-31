import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ActivityLogModule } from '@/modules/activity-log/activity-log.module';
import { User } from '@/modules/users/entities/user.entity';

import { AnalyticsController } from './analytics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), ActivityLogModule],
  controllers: [AnalyticsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class AnalyticsModule {}
