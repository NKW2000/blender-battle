import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChallengesModule } from '@/modules/challenges/challenges.module';
import { UploadsModule } from '@/modules/uploads/uploads.module';

import { BallotService } from './ballot.service';
import { RoomSchedulerService } from './room-scheduler.service';
import { Room } from './entities/room.entity';
import { RoomParticipant } from './entities/room-participant.entity';
import { Submission } from './entities/submission.entity';
import { SubmissionLike } from './entities/submission-like.entity';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

/**
 * Rooms run alongside battles rather than replacing them in place.
 *
 * Existing battle history stays readable while this is built out, and nothing
 * already scored has to be rewritten into a shape it was never recorded in.
 * Battles come out once rooms carry the whole flow.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Room, RoomParticipant, Submission, SubmissionLike]),
    ChallengesModule,
    UploadsModule,
  ],
  controllers: [RoomsController],
  providers: [RoomsService, RoomSchedulerService, BallotService],
  exports: [RoomsService],
})
export class RoomsModule {}
