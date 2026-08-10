import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@bb/shared';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

/**
 * Tokens are 32 random bytes in base64url — 43 characters.
 *
 * Bounded rather than left open so a multi-megabyte body cannot be pushed
 * through the hash function on an unauthenticated endpoint.
 */
const TOKEN_MAX_LENGTH = 128;

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(320)
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(TOKEN_MAX_LENGTH)
  token: string;

  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  password: string;
}

export class VerifyEmailDto {
  @IsString()
  @MaxLength(TOKEN_MAX_LENGTH)
  token: string;
}
