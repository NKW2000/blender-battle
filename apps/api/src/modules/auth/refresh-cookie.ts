import type { CookieOptions, Request, Response } from 'express';

import { AppConfig } from '@/config/app.config';

export const REFRESH_COOKIE = 'bb_refresh';

/**
 * The refresh token's transport.
 *
 * It used to live in `localStorage` and travel in a request body, which made
 * any XSS a full account takeover: injected script could read the token, and a
 * refresh token is a long-lived credential for the whole account. An httpOnly
 * cookie is not readable from JavaScript at all, so the same injection can at
 * worst act as the user while the page is open — bad, but bounded and over when
 * the tab closes.
 *
 * ## The cross-site problem
 *
 * The web app is on Cloudflare Workers and the API is on Render, so in
 * production these are genuinely different sites and the cookie has to be
 * `SameSite=None; Secure` to be sent at all. In development both run on
 * `localhost` — different ports, same site — so `Lax` works there and `Secure`
 * would stop the cookie being set over plain HTTP.
 *
 * `SameSite=None` is what makes CSRF a live concern rather than a theoretical
 * one, which is why the endpoints that read this cookie also demand a custom
 * header. See `assertNotCrossSite`.
 */
export function refreshCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    /*
      Scoped to the auth routes.

      The cookie is only ever read by refresh and logout, so there is no reason
      to attach it to every upload and every poll — that is bandwidth on every
      request and one more place it can be logged by a proxy.
    */
    path: '/api/v1/auth',
    // Matches the refresh token's own lifetime. A cookie that outlives the
    // token it carries just produces confusing 401s on a dead credential.
    maxAge: config.jwt.refreshTtlSeconds * 1000,
  };
}

export function setRefreshCookie(res: Response, token: string, config: AppConfig): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(config));
}

export function clearRefreshCookie(res: Response, config: AppConfig): void {
  // Cleared with the same attributes it was set with — a cookie whose path or
  // sameSite differs is a *different* cookie, and the original survives.
  const { maxAge: _maxAge, ...options } = refreshCookieOptions(config);
  res.clearCookie(REFRESH_COOKIE, options);
}

/**
 * Reads the cookie without `cookie-parser`.
 *
 * One header, one name, no dependency. The value is base64url JWT text, so it
 * needs no percent-decoding; splitting on the first `=` keeps any padding
 * intact rather than losing everything after a second one.
 */
export function readRefreshCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== REFRESH_COOKIE) continue;
    return part.slice(separator + 1).trim() || null;
  }

  return null;
}
