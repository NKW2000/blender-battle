import type { ApiResponse } from '@bb/shared';

/**
 * Where server-side reads go.
 *
 * `API_URL` first, and it is deliberately not a `NEXT_PUBLIC_*` name. Those are
 * inlined into the bundle by `next build` and fixed from then on, which is
 * correct for the browser — it is the only way the browser can learn the URL —
 * but wrong here: this code runs on the server, where the value can be read at
 * request time from the Worker's own bindings.
 *
 * The practical difference is that the same build can be pointed at a different
 * API without recompiling. It also makes the page testable: a production build
 * verified locally would otherwise reach for the deployed API and render
 * "not found" for everything in the local database.
 *
 * `NEXT_PUBLIC_API_URL` remains the fallback so nothing breaks if `API_URL` is
 * not set.
 */
const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Unauthenticated reads, performed on the server.
 *
 * Used by the public pages to render their content into the initial HTML and to
 * build `<head>`. Deliberately separate from `lib/api/client`, which carries an
 * access token, refreshes on 401 and reads from a module-level store — none of
 * which exists or makes sense during a server render, where there is no session
 * and the module is shared between every visitor at once.
 *
 * Returns null rather than throwing. Every caller's answer to "the API is down
 * or this does not exist" is the same — render the not-found state — and a
 * throw here would turn a missing brief into a 500.
 */
export async function fetchPublic<T>(
  path: string,
  options: { revalidate?: number } = {},
): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      /*
        Cached briefly rather than not at all.

        These pages are the ones that get shared, so a burst of traffic on one
        link should not be a burst of identical queries against a free-tier
        database. Sixty seconds is short enough that a manager publishing a
        brief sees it almost immediately, and long enough to flatten a spike.
      */
      next: { revalidate: options.revalidate ?? 60 },
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as ApiResponse<T>;
    return payload.success ? payload.data : null;
  } catch {
    // The API being unreachable must not take the page down with it.
    return null;
  }
}
