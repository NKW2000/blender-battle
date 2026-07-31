import { BIO_MAX_LENGTH, ExperienceLevel } from '@bb/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsISO31661Alpha2,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Social links are validated per-key rather than accepted as free-form JSON: the
 * values are rendered as anchors, so an unchecked `javascript:` URL would be a
 * stored XSS vector. `require_protocol` plus an https/http allowlist blocks it.
 */
class SocialLinksDto {
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  website?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  twitter?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  artstation?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  youtube?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  instagram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  discord?: string;
}

/**
 * Deliberately omits username, email, role, status and every statistic. Anything
 * absent from this DTO cannot be changed through this endpoint, and the global
 * ValidationPipe strips unknown properties before the object ever reaches a
 * service — mass assignment is closed by construction, not by remembering to
 * blocklist fields.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(BIO_MAX_LENGTH)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  bio?: string;

  @IsOptional()
  @IsISO31661Alpha2({ message: 'Must be a two-letter ISO country code' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  country?: string;

  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SocialLinksDto)
  socialLinks?: SocialLinksDto;
}
