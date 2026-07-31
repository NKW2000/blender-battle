import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ApiErrorCode } from '@bb/shared';

import { IS_OPTIONAL_AUTH_KEY, IS_PUBLIC_KEY } from '../decorators';
import { AppException } from '../exceptions/app.exception';

/**
 * Registered globally in AppModule. Routes are protected unless explicitly marked
 * @Public(), so a new controller is secure by omission.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;
    return super.canActivate(context);
  }

  override handleRequest<TUser>(
    err: unknown,
    user: TUser,
    info: unknown,
    context?: ExecutionContext,
  ): TUser {
    // Optional-auth routes proceed either way; the handler decides what an
    // anonymous caller is allowed to see.
    if (context) {
      const isOptional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (isOptional) return (user ?? null) as TUser;
    }

    if (err || !user) {
      // Distinguish "expired" from "invalid" so the client knows to attempt a
      // silent refresh instead of dumping the user back on the login screen.
      const isExpired =
        info instanceof Error && info.name === 'TokenExpiredError';

      throw AppException.unauthorized(
        isExpired ? ApiErrorCode.TOKEN_EXPIRED : ApiErrorCode.UNAUTHORIZED,
        isExpired ? 'Access token expired' : 'Authentication required',
      );
    }
    return user;
  }
}
