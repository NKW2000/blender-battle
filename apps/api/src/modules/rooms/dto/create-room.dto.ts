import {
  Difficulty,
  ROOM_MAX_PLAYERS,
  ROOM_MIN_PLAYERS,
  ROOM_NAME_MAX_LENGTH,
  ROOM_NAME_MIN_LENGTH,
  RoomVisibility,
} from '@bb/shared';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

/**
 * What a host may set when opening a room.
 *
 * Note what is absent: there is no `challengeId`. The host declares the kind of
 * brief they want and the server draws the specific one at kickoff. Accepting an
 * id here would hand the host advance knowledge of their own contest.
 *
 * `endsAt` is an absolute instant, not a duration in hours — the host's browser
 * converts whatever local date/time they picked to a UTC instant before this
 * ever arrives, so the deadline means the same moment to every player regardless
 * of timezone. The room's actual modelling window is only fixed once the host
 * presses Start (`RoomsService.start`), which checks that this deadline still
 * leaves enough time from that later moment.
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

  /**
   * Whether the room appears in the public list.
   *
   * The column has existed since rooms were built and nothing ever assigned it,
   * so every room sat at the `public` default while being reachable only by
   * someone handing over the join code — a listing flag that listed nothing and
   * a "public" room nobody could find.
   *
   * Private is the default because that is what rooms have actually been until
   * now, and silently publishing every existing host's next room would be a
   * surprising way to ship a listing.
   *
   * A private room is not a lesser contest: whether a result counts is decided
   * by how many people submitted, not by who could see the room.
   */
  @IsOptional()
  @IsEnum(RoomVisibility)
  visibility?: RoomVisibility;

  @IsDateString()
  endsAt: string;
}
