import { BIO_MAX_LENGTH, ExperienceLevel, SHOWCASE_MAX_ITEMS } from '@bb/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO31661Alpha2,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Social links are validated per-key rather than accepted as free-form JSON: the
 * values are rendered as anchors, so an unchecked `javascript:` URL would be a
 * stored XSS vector. `require_protocol` plus an https/http allowlist blocks it.
 */
/**
 * Every link is validated as an absolute http(s) URL.
 *
 * `require_protocol` matters more than it looks: without it "javascript:alert(1)"
 * and "artstation.com/me" both pass, and the first is a script that runs when a
 * visitor clicks a link on someone else's profile. Restricting the protocol list
 * to http and https is what makes these safe to render as anchors.
 *
 * Discord is the exception — a handle, not a URL, because there is no public
 * profile page to point at.
 */
class SocialLinksDto {
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  website?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  artstation?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  sketchfab?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  behance?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  instagram?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  youtube?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  tiktok?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  facebook?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  twitter?: string;

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

  /**
   * Ordered entry ids to pin to the profile showcase.
   *
   * Shape is validated here; ownership and model-presence are not — those depend
   * on rows this DTO cannot see, so the service checks that every id belongs to
   * the caller's own finished, model-bearing entries before it stores anything.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SHOWCASE_MAX_ITEMS)
  @IsUUID('4', { each: true })
  showcaseEntryIds?: string[];
}
