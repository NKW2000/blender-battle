import { Module } from '@nestjs/common';

import { AuthModule } from '@/modules/auth/auth.module';
import { ChallengesModule } from '@/modules/challenges/challenges.module';
import { RoomsModule } from '@/modules/rooms/rooms.module';

import { MaintenanceController } from './maintenance.controller';

/**
 * Nothing of its own — it borrows the three schedulers and exposes them.
 *
 * The modules that own that work already export their services for the
 * intervals to use; this adds a way to trigger the same methods from outside
 * the process, for hosts that do not have one.
 */
@Module({
  imports: [RoomsModule, ChallengesModule, AuthModule],
  controllers: [MaintenanceController],
})
export class MaintenanceModule {}
