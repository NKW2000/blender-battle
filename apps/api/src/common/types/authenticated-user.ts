import type { Role } from '@bb/shared';

/** Principal decoded from a verified access token and attached to the request. */
export interface AuthenticatedUser {
  id: string;
  username: string;
  role: Role;
  /** Token id, used to check the Redis revocation denylist. */
  jti: string;
  /** Token expiry (epoch seconds). Logout denylists the jti until this moment. */
  exp: number;
}

/** Access-token claims. Kept minimal — a JWT is readable by anyone holding it. */
export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: Role;
  jti: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Token family, so reuse detection can revoke the whole lineage. */
  fam: string;
  jti: string;
  iat?: number;
  exp?: number;
}
