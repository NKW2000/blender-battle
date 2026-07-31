import {
  CHALLENGE_DESCRIPTION_MAX_LENGTH,
  CHALLENGE_MAX_MINUTES,
  CHALLENGE_MAX_OBJECTIVES,
  CHALLENGE_MAX_TAGS,
  CHALLENGE_MAX_XP,
  CHALLENGE_MIN_MINUTES,
  CHALLENGE_MIN_XP,
  CHALLENGE_TITLE_MAX_LENGTH,
  ChallengeStatus,
  ChallengeVisibility,
  Difficulty,
} from '@bb/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { CursorQueryDto } from '@/common/dto/cursor-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateChallengeDto {
  @IsString()
  @Length(4, CHALLENGE_TITLE_MAX_LENGTH)
  @Transform(trim)
  title: string;

  @IsString()
  @Length(20, CHALLENGE_DESCRIPTION_MAX_LENGTH)
  @Transform(trim)
  description: string;

  @IsEnum(Difficulty)
  difficulty: Difficulty;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsInt()
  @Min(CHALLENGE_MIN_MINUTES)
  @Max(CHALLENGE_MAX_MINUTES)
  estimatedMinutes?: number;

  /**
   * Bounded server-side as well as by a database CHECK. A manager minting a
   * 100,000 XP challenge would rewrite the leaderboard in one battle.
   *
   * Optional on create: the service defaults it to the difficulty's baseline.
   */
  @IsOptional()
  @IsInt()
  @Min(CHALLENGE_MIN_XP)
  @Max(CHALLENGE_MAX_XP)
  rewardXp?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+$/, { message: 'Use a version like 4.2' })
  blenderVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  rules?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CHALLENGE_MAX_OBJECTIVES)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  objectives?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(trim)
  allowedAssets?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(trim)
  forbiddenAssets?: string;

  /**
   * Tag names, not ids. Managers type words; the service resolves each to an
   * existing tag or creates one, so the client never has to pre-register a tag.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CHALLENGE_MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(ChallengeVisibility)
  visibility?: ChallengeVisibility;
}

/**
 * Every field optional, and `status` is absent on purpose — publishing and
 * archiving are separate endpoints that enforce their own preconditions, not a
 * field anyone can set to 'published' while the challenge is still empty.
 */
export class UpdateChallengeDto {
  @IsOptional()
  @IsString()
  @Length(4, CHALLENGE_TITLE_MAX_LENGTH)
  @Transform(trim)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(20, CHALLENGE_DESCRIPTION_MAX_LENGTH)
  @Transform(trim)
  description?: string;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsInt()
  @Min(CHALLENGE_MIN_MINUTES)
  @Max(CHALLENGE_MAX_MINUTES)
  estimatedMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(CHALLENGE_MIN_XP)
  @Max(CHALLENGE_MAX_XP)
  rewardXp?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+$/, { message: 'Use a version like 4.2' })
  blenderVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  rules?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CHALLENGE_MAX_OBJECTIVES)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  objectives?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(trim)
  allowedAssets?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(trim)
  forbiddenAssets?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CHALLENGE_MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(ChallengeVisibility)
  visibility?: ChallengeVisibility;
}

export class ListChallengesQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  tag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(trim)
  search?: string;

  /**
   * Manager view only. Players never see drafts: the service ignores this unless
   * the caller owns the rows or is an admin.
   */
  @IsOptional()
  @IsEnum(ChallengeStatus)
  status?: ChallengeStatus;

  @IsOptional()
  @Type(() => Boolean)
  mine?: boolean;
}

/**
 * The random draw takes filters only. There is deliberately no challenge id
 * field: "random" that accepts an id is not random, it is a client picking its
 * own opponent's brief.
 */
export class DrawChallengeDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  /**
   * Ids the caller has just been shown, so a re-roll does not return the same
   * brief. Advisory only — never trusted to widen the eligible set.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  excludeIds?: string[];
}
