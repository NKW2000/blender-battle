import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@bb/shared';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../types/authenticated-user';

export const IS_PUBLIC_KEY = 'auth:public';
export const IS_OPTIONAL_AUTH_KEY = 'auth:optional';
export const ROLES_KEY = 'auth:roles';

/**
 * Opts a route out of the globally-applied JwtAuthGuard.
 *
 * Authentication is on by default and switched off per route, never the reverse —
 * forgetting this decorator makes an endpoint unreachable (loud, caught in
 * development) instead of unprotected (silent, caught by an attacker).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Reachable without a token, but a valid token is still decoded and attached.
 *
 * For endpoints whose *response* depends on who is asking — challenge browse
 * returns the public catalogue to a visitor and additionally the caller's own
 * drafts to a manager, from the same URL. @Public() alone cannot express this:
 * it skips the strategy, so req.user is always empty and a signed-in manager
 * would silently be treated as anonymous.
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);

/** Minimum role required. Higher-ranked roles pass automatically via ROLE_RANK. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the JWT-derived principal. Never trust it for anything but identity. */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
