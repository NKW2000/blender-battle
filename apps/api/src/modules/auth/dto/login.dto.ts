import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  /**
   * No @Length here beyond an upper bound: rejecting a short password with a
   * validation error tells an attacker the input never reached the hash
   * comparison. Wrong credentials must all fail the same way.
   */
  @IsString()
  @MaxLength(128)
  password: string;
}
