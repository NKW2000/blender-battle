import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UploadsModule } from '@/modules/uploads/uploads.module';

import { ChallengeAssetsService } from './challenge-assets.service';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { Category } from './entities/category.entity';
import { ChallengeAsset } from './entities/challenge-asset.entity';
import { ChallengeEventSchedulerService } from './challenge-event-scheduler.service';
import { ChallengeEventsController } from './challenge-events.controller';
import { ChallengeEventsService } from './challenge-events.service';
import { Challenge } from './entities/challenge.entity';
import { ChallengeEntry } from './entities/challenge-entry.entity';
import { ChallengeVote } from './entities/challenge-vote.entity';
import { Tag } from './entities/tag.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Challenge, Category, Tag, ChallengeAsset, ChallengeEntry, ChallengeVote]),
    UploadsModule,
  ],
  controllers: [ChallengesController, ChallengeEventsController],
  providers: [
    ChallengesService,
    ChallengeAssetsService,
    ChallengeEventsService,
    ChallengeEventSchedulerService,
  ],
  // Phase 3 battles resolve the drawn challenge through this service.
  exports: [ChallengesService, ChallengeEventsService],
})
export class ChallengesModule {}
