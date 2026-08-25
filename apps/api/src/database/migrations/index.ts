import { InitPhase11753600000000 } from './1753600000000-InitPhase1';
import { Phase2Challenges1753700000000 } from './1753700000000-Phase2Challenges';
import { Phase3Battles1753800000000 } from './1753800000000-Phase3Battles';
import { Phase5Foundations1753900000000 } from './1753900000000-Phase5Foundations';
import { ReadyCheckEnum1754000000000 } from './1754000000000-ReadyCheckEnum';
import { ReadyCheckColumns1754000100000 } from './1754000100000-ReadyCheckColumns';
import { RoomsEnums1754100000000 } from './1754100000000-RoomsEnums';
import { RoomsTables1754100100000 } from './1754100100000-RoomsTables';
import { PublicChallengeEvents1754200000000 } from './1754200000000-PublicChallengeEvents';
import { ChallengeVotingWindow1754300000000 } from './1754300000000-ChallengeVotingWindow';
import { UserShowcase1754400000000 } from './1754400000000-UserShowcase';
import { EntryWorkspacePhoto1754500000000 } from './1754500000000-EntryWorkspacePhoto';
import { SubmissionWorkspacePhoto1754600000000 } from './1754600000000-SubmissionWorkspacePhoto';
import { NotificationTypes1754700000000 } from './1754700000000-NotificationTypes';
import { ChallengeVotingNotified1754700100000 } from './1754700100000-ChallengeVotingNotified';
import { DropDeadVerticals1754700200000 } from './1754700200000-DropDeadVerticals';
import { DropReservedColumns1754700300000 } from './1754700300000-DropReservedColumns';
import { AccountRecovery1754700400000 } from './1754700400000-AccountRecovery';
import { ModelingOnly1754700500000 } from './1754700500000-ModelingOnly';
import { AppleProvider1754700600000 } from './1754700600000-AppleProvider';

/**
 * Every migration, listed rather than globbed.
 *
 * A glob works when the application runs from `dist` as loose files, and does
 * not when it is bundled: the bundler cannot follow a path built at runtime, so
 * `__dirname` points at the function root and the pattern matches nothing. That
 * failure is silent in the worst way — TypeORM reports zero pending migrations
 * and starts happily against a database with no tables, and the first query is
 * what finally fails.
 *
 * An explicit list is bundler-safe by construction, and it makes the order a
 * reviewable fact rather than a consequence of how filenames happen to sort.
 *
 * Add new migrations to the bottom. The timestamp prefix still determines the
 * order TypeORM runs them in, so a file added out of place is a mistake this
 * list makes visible rather than one it hides.
 */
export const migrations = [
  InitPhase11753600000000,
  Phase2Challenges1753700000000,
  Phase3Battles1753800000000,
  Phase5Foundations1753900000000,
  ReadyCheckEnum1754000000000,
  ReadyCheckColumns1754000100000,
  RoomsEnums1754100000000,
  RoomsTables1754100100000,
  PublicChallengeEvents1754200000000,
  ChallengeVotingWindow1754300000000,
  UserShowcase1754400000000,
  EntryWorkspacePhoto1754500000000,
  SubmissionWorkspacePhoto1754600000000,
  NotificationTypes1754700000000,
  ChallengeVotingNotified1754700100000,
  DropDeadVerticals1754700200000,
  DropReservedColumns1754700300000,
  AccountRecovery1754700400000,
  ModelingOnly1754700500000,
  AppleProvider1754700600000,
];
