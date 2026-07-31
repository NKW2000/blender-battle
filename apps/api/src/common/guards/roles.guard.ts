import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_RANK, type Role } from '@bb/shared';
import type { Request } from 'express';

import { ROLES_KEY } from '../decorators';
import { AppException } from '../exceptions/app.exception';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Rank-based rather than exact-match: `@Roles(Role.MANAGER)` admits managers and
 * admins. Exact matching forces every manager route to also list admin, and the
 * one that gets forgotten becomes a route an admin cannot use.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) throw AppException.unauthorized();

    const minimumRank = Math.min(...required.map((role) => ROLE_RANK[role]));
    if (ROLE_RANK[user.role] < minimumRank) {
      throw AppException.forbidden();
    }

    return true;
  }
}
