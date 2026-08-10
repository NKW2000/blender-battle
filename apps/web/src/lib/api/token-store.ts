/**
 * Token storage.
 *
 * The access token is held in a module-level variable and nowhere else: it
 * never touches localStorage, so injected script cannot read it out of
 * persistent storage, and it dies with the tab. Its 15-minute lifetime bounds
 * the damage either way.
 *
 * **The refresh token is not here at all.** It is delivered by the API as an
 * httpOnly cookie scoped to `/api/v1/auth`, which means JavaScript cannot read
 * it, cannot copy it, and cannot send it anywhere except back to the endpoint
 * that issued it. This file used to persist it in localStorage, which made any
 * XSS a permanent full-account takeover — the payload could exfiltrate a
 * long-lived credential and keep using it long after the tab closed.
 *
 * What the client is left with is a session it can use but cannot see. That is
 * the point: there is no value here for an attacker to steal, only a browser
 * behaviour to borrow while the page is open.
 *
 * The cost is that "am I signed in?" is no longer answerable locally — the only
 * way to find out is to ask the server, which is what `bootstrapSession` in the
 * client does on first load.
 */

let accessToken: string | null = null;

export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken;
  },

  set(tokens: { accessToken: string }): void {
    accessToken = tokens.accessToken;
  },

  clear(): void {
    accessToken = null;
  },
};
