import { IsString, Length } from 'class-validator';

/**
 * The single-use code handed to the browser after a provider callback.
 *
 * Deliberately opaque: it is a random Redis key, not a token, so nothing about
 * the session can be read out of it before it is redeemed.
 */
export class OAuthExchangeDto {
  @IsString()
  @Length(20, 128)
  code: string;
}
