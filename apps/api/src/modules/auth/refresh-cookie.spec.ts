import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { AppException } from '@/common/exceptions/app.exception';
import type { AppConfig } from '@/config/app.config';

import { REFRESH_COOKIE, readRefreshCookie, refreshCookieOptions } from './refresh-cookie';
import { SameSiteGuard } from './same-site.guard';

/**
 * The refresh token's transport.
 *
 * Every property here is one an attacker would exploit if it were wrong, and
 * none of them is visible in the running application: a cookie that is not
 * httpOnly still works, a cookie that is `SameSite=Lax` in production still
 * works on same-site requests, and a missing CSRF header still lets the real
 * client through. The failure is always silent.
 */

const config = (isProduction: boolean) =>
  ({
    isProduction,
    jwt: { refreshTtlSeconds: 7 * 24 * 60 * 60 },
  }) as AppConfig;

const requestWith = (headers: Record<string, string | undefined>) =>
  ({ headers }) as unknown as Request;

describe('refreshCookieOptions', () => {
  it('is unreadable from JavaScript', () => {
    // The whole point. Without this, an XSS payload reads a long-lived
    // credential straight out of document.cookie and the move from
    // localStorage bought nothing.
    expect(refreshCookieOptions(config(true)).httpOnly).toBe(true);
    expect(refreshCookieOptions(config(false)).httpOnly).toBe(true);
  });

  it('is cross-site and secure in production', () => {
    /*
      The two apps are separate Vercel projects — different
      sites — so `SameSite=None` is required for the cookie to be sent at all,
      and browsers refuse `None` without `Secure`. Getting this wrong does not
      error; it silently signs everyone out on every page load.
    */
    const options = refreshCookieOptions(config(true));

    expect(options.sameSite).toBe('none');
    expect(options.secure).toBe(true);
  });

  it('is lax and insecure in development', () => {
    // `localhost:3000` and `localhost:4000` are the same site, so `Lax` works —
    // and `Secure` would stop the cookie being set at all over plain HTTP.
    const options = refreshCookieOptions(config(false));

    expect(options.sameSite).toBe('lax');
    expect(options.secure).toBe(false);
  });

  it('is scoped to the auth routes only', () => {
    // Not attached to every upload and poll: less bandwidth, and one fewer
    // place for a proxy to log it.
    expect(refreshCookieOptions(config(true)).path).toBe('/api/v1/auth');
  });

  it('expires with the token it carries', () => {
    // A cookie outliving its token produces 401s on a credential the browser
    // still believes in; one that dies first signs people out early.
    expect(refreshCookieOptions(config(true)).maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('readRefreshCookie', () => {
  it('finds the cookie among others', () => {
    expect(
      readRefreshCookie(requestWith({ cookie: `theme=dark; ${REFRESH_COOKIE}=abc.def; tz=UTC` })),
    ).toBe('abc.def');
  });

  it('keeps a value containing "="', () => {
    // base64 padding. Splitting on every `=` rather than the first would throw
    // away the tail of a token and turn a valid session into a mystery 401.
    expect(readRefreshCookie(requestWith({ cookie: `${REFRESH_COOKIE}=a=b==` }))).toBe('a=b==');
  });

  it('is null when absent, empty, or there is no cookie header', () => {
    expect(readRefreshCookie(requestWith({}))).toBeNull();
    expect(readRefreshCookie(requestWith({ cookie: 'theme=dark' }))).toBeNull();
    expect(readRefreshCookie(requestWith({ cookie: `${REFRESH_COOKIE}=` }))).toBeNull();
  });

  it('does not match a cookie whose name merely ends with the same text', () => {
    // `not_bb_refresh` must not be mistaken for `bb_refresh`.
    expect(readRefreshCookie(requestWith({ cookie: `not_${REFRESH_COOKIE}=nope` }))).toBeNull();
  });
});

describe('SameSiteGuard', () => {
  const guard = new SameSiteGuard();
  const contextWith = (headers: Record<string, string | undefined>) =>
    ({
      switchToHttp: () => ({ getRequest: () => requestWith(headers) }),
    }) as never;

  it('allows a request carrying the client header', () => {
    expect(guard.canActivate(contextWith({ 'x-bb-client': '1' }))).toBe(true);
  });

  it('refuses a request without it', () => {
    /*
      The cross-site form post. It is the one request a hostile page can make
      that is never preflighted, and it cannot set headers — so demanding one
      closes it. Without this guard, any site could force a rotation with the
      victim's cookie attached and sign them out at will.
    */
    expect(() => guard.canActivate(contextWith({}))).toThrow(AppException);
  });
});
