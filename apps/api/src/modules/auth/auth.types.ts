import type { AuthSession, AuthTokens } from '@bb/shared';

/**
 * Server-side shapes that still carry the refresh token.
 *
 * The public contracts (`AuthTokens`, `AuthSession`) do not, because the token
 * is delivered as an httpOnly cookie and never reaches JavaScript. Services
 * still have to produce it — something has to put it in the cookie — so they
 * return these, and the controller is the single place that moves the value out
 * of the body and into `Set-Cookie`.
 *
 * Keeping the distinction in the type system rather than in a comment is what
 * stops a future endpoint from returning the token in a response body by
 * accident: the public type has no field to put it in.
 */
export interface IssuedTokens extends AuthTokens {
  refreshToken: string;
}

export interface IssuedSession extends AuthSession {
  refreshToken: string;
}
