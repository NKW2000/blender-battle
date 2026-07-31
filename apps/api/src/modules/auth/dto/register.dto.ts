import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@bb/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

/**
 * The API boundary validates independently of the client. The frontend's Zod
 * schema exists for immediate feedback only; this class is what actually decides
 * whether a request is acceptable, because any client can be bypassed with curl.
 *
 * Note there is no `role` field. Role is assigned server-side (always PLAYER on
 * registration) — accepting it from the request body would be a privilege
 * escalation handed over for free.
 */
export class RegisterDto {
  @IsString()
  @Length(USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH)
  @Matches(USERNAME_PATTERN, {
    message:
      'Username may contain letters, numbers, underscores and hyphens, and must start and end with a letter or number',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  username: string;

  @IsEmail({}, { message: 'Must be a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  /**
   * Length is the requirement, not character-class rules. A 12-character
   * passphrase beats "P@ss1!" comfortably, and composition rules mostly push
   * users toward predictable substitutions.
   */
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  password: string;
}
