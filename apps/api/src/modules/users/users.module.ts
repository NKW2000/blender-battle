import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AnalyticsModule } from '@/modules/analytics/analytics.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { ChallengeEntry } from '@/modules/challenges/entities/challenge-entry.entity';
import { UploadsModule } from '@/modules/uploads/uploads.module';

import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // AuthModule exports TokenService so admin actions can revoke sessions.
  // AnalyticsModule exports LeaderboardService, which supplies profile rank and
  // removes banned accounts from the public ranking.
  // ChallengeEntry is registered directly rather than by importing the challenges
  // module: the portfolio only reads finished entries, and importing the module
  // for one repository would create a cycle (challenges already depends on users).
  imports: [
    TypeOrmModule.forFeature([User, ChallengeEntry]),
    UploadsModule,
    AuthModule,
    AnalyticsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
