import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChallengesModule } from '@/modules/challenges/challenges.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { UploadsModule } from '@/modules/uploads/uploads.module';

import { BallotService } from './ballot.service';
import { RoomSchedulerService } from './room-scheduler.service';
import { Room } from './entities/room.entity';
import { RoomParticipant } from './entities/room-participant.entity';
import { Submission } from './entities/submission.entity';
import { SubmissionLike } from './entities/submission-like.entity';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

/** Private, invite-or-browse contests: the platform's primary contest mode. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Room, RoomParticipant, Submission, SubmissionLike]),
    ChallengesModule,
    UploadsModule,
    NotificationsModule,
  ],
  controllers: [RoomsController],
  providers: [RoomsService, RoomSchedulerService, BallotService],
  exports: [RoomsService],
})
export class RoomsModule {}
