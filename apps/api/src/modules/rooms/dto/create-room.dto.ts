import {
  Difficulty,
  ROOM_MAX_PLAYERS,
  ROOM_MIN_PLAYERS,
  ROOM_NAME_MAX_LENGTH,
  ROOM_NAME_MIN_LENGTH,
} from '@bb/shared';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

import { CHALLENGE_MAX_MINUTES, CHALLENGE_MIN_MINUTES } from '@bb/shared';

/**
 * What a host may set when opening a room.
 *
 * Note what is absent: there is no `challengeId`. The host declares the kind of
 * brief they want and the server draws the specific one at kickoff. Accepting an
 * id here would hand the host advance knowledge of their own contest.
 */
export class CreateRoomDto {
  @IsString()
  @Length(ROOM_NAME_MIN_LENGTH, ROOM_NAME_MAX_LENGTH)
  name: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsInt()
  @Min(ROOM_MIN_PLAYERS)
  @Max(ROOM_MAX_PLAYERS)
  maxPlayers?: number;

  @IsOptional()
  @IsInt()
  @Min(CHALLENGE_MIN_MINUTES * 60)
  @Max(CHALLENGE_MAX_MINUTES * 60)
  durationSeconds?: number;
}
