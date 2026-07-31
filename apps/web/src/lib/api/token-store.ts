/**
 * Token storage.
 *
 * The access token is held in a module-level variable only: it never touches
 * localStorage, so an XSS payload cannot read it out of persistent storage, and
 * it dies with the tab. Its 15-minute lifetime bounds the damage either way.
 *
 * The refresh token is persisted, because otherwise every page reload signs the
 * user out. This is a deliberate, and the weakest, tradeoff in the auth design:
 *
 *   - localStorage (chosen): survives reload, readable by injected script.
 *   - memory only: strictly safer, but a refresh loses the session entirely.
 *   - httpOnly cookie scoped to POST /auth/refresh: safest of the three. It does
 *     NOT reintroduce CSRF exposure for the rest of the API, because every other
 *     endpoint still authenticates with the Authorization header — a forged
 *     cross-site request could at most rotate a token, and receives the result on
 *     an origin it cannot read.
 *
 * The cookie option is the recommended upgrade before this platform holds
 * anything of value. It is not adopted here only because the brief specifies
 * header-based transport; the decision is worth revisiting explicitly rather
 * than inheriting by default.
 */

const REFRESH_KEY = 'bb.refresh';

let accessToken: string | null = null;
/** Notifies React that auth state changed without a full-page reload. */
const listeners = new Set<() => void>();

export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken;
  },

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(REFRESH_KEY);
  },

  set(tokens: { accessToken: string; refreshToken: string }): void {
    accessToken = tokens.accessToken;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    }
    listeners.forEach((listener) => listener());
  },

  clear(): void {
    accessToken = null;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(REFRESH_KEY);
    }
    listeners.forEach((listener) => listener());
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
