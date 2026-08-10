import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiErrorCode } from '@bb/shared';
import type { Request } from 'express';

import { AppException } from '@/common/exceptions/app.exception';

/**
 * The header a first-party caller must send.
 *
 * Its value is irrelevant — only that it is present, because a custom header is
 * something a cross-site request cannot add without asking permission first.
 */
export const FETCH_MODE_HEADER = 'x-bb-client';

/**
 * CSRF protection for the endpoints that authenticate with the refresh cookie.
 *
 * ## Why this is needed at all
 *
 * The refresh cookie is `SameSite=None` in production, because the web app and
 * the API are on different sites and the cookie would otherwise never be sent.
 * That is the setting that makes CSRF real: any page anywhere can cause the
 * browser to POST to `/auth/refresh` with the victim's cookie attached.
 *
 * The attacker cannot *read* the response — CORS sees to that — so nothing
 * leaks. What they can do is force a rotation, which invalidates the token the
 * real client holds and signs the user out; and if the same forged request is
 * replayed, the reuse detector revokes the entire family. A logout-anyone
 * primitive is a small bug that is trivially fixed, not one to leave standing.
 *
 * ## Why a header, and not a token
 *
 * A double-submit CSRF token needs a second cookie, a way to seed it, and a
 * rotation story of its own. This needs none of that: a request carrying a
 * non-standard header is only dispatched after a successful CORS preflight, and
 * the preflight names the origin. An origin outside the allowlist is refused by
 * the browser before the real request is ever sent, so the header's presence is
 * itself proof that an allowlisted origin asked for it.
 *
 * A `<form>` post — the one cross-site request that is never preflighted —
 * cannot set headers at all, which is exactly the case this closes.
 */
@Injectable()
export class SameSiteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.headers[FETCH_MODE_HEADER]) {
      throw new AppException(
        ApiErrorCode.FORBIDDEN,
        'This endpoint may only be called by the application.',
        403,
      );
    }

    return true;
  }
}
