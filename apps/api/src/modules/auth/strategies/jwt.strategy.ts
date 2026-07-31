import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AppConfig } from '@/config/app.config';
import type {
  AccessTokenPayload,
  AuthenticatedUser,
} from '@/common/types/authenticated-user';

import { TokenService } from '../services/token.service';

/**
 * Validates the access token on every protected request.
 *
 * The token is read from the Authorization header, not a cookie. That choice is
 * what removes the need for CSRF protection: a cross-site request cannot attach
 * an Authorization header the browser does not send automatically. Do not add
 * csurf or any CSRF middleware to this API — it would guard a threat that this
 * transport does not have.
 *
 * The database is intentionally not queried here. The claims carry everything a
 * guard needs, and a per-request user lookup would put a read on the hot path of
 * every single endpoint. Revocation is handled by the Redis denylist below, and
 * role/status changes take effect within the access token's 15-minute lifetime.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfig,
    private readonly tokens: TokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessSecret,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (await this.tokens.isAccessTokenDenylisted(payload.jti)) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      jti: payload.jti,
      exp: payload.exp ?? 0,
    };
  }
}
