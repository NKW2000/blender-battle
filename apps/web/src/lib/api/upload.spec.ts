import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from './client';
import { tokenStore } from './token-store';

/**
 * Uploading an entry.
 *
 * The two submission hooks used to post their own `fetch` with nothing but an
 * Authorization header, which made them the only requests in the application
 * with no refresh-and-retry. An access token lives fifteen minutes; a room's
 * modelling window runs forty-five. So an entry submitted late in a room went
 * out with a token that had already aged out, came back 401, and was lost —
 * with nothing stored and, before the error branch existed, nothing on screen.
 * Refreshing then showed no entry, because there was none.
 *
 * These assert the properties that made routing through `api.upload` the fix,
 * not a tidy-up: the multipart boundary is still the browser's to set, the CSRF
 * header is present, and a stale token is refreshed and the upload replayed
 * rather than dropped.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  tokenStore.clear();
});

interface Call {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Replies 401 for the first `failures` calls, then succeeds. */
function stubFetch(failures: number) {
  const calls: Call[] = [];
  let seen = 0;

  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body,
    });

    // The refresh call itself always succeeds, and hands back a new token.
    if (url.includes('/auth/refresh')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { accessToken: 'fresh-token', user: { id: 'u1' } },
        }),
      } as Response;
    }

    seen += 1;
    if (seen <= failures) {
      return {
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          message: 'Token expired',
          error: { code: 'TOKEN_EXPIRED' },
        }),
      } as Response;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 'entry-1' } }),
    } as Response;
  });

  return calls;
}

const form = () => {
  const data = new FormData();
  data.append('image', new Blob(['render'], { type: 'image/png' }), 'render.png');
  data.append('workspace', new Blob(['shot'], { type: 'image/png' }), 'shot.png');
  return data;
};

describe('api.upload', () => {
  it('lets the browser set the multipart boundary', async () => {
    /*
      Setting Content-Type by hand here is the classic multipart mistake: the
      header would carry no boundary, and the server would parse zero files out
      of a body that looks fine on the wire.
    */
    const calls = stubFetch(0);
    await api.upload('/rooms/r1/submit', form());

    const upload = calls.find((call) => call.url.includes('/submit'))!;
    expect(upload.headers['Content-Type']).toBeUndefined();
    expect(upload.body).toBeInstanceOf(FormData);
  });

  it('sends the first-party header the JSON calls send', async () => {
    const calls = stubFetch(0);
    await api.upload('/rooms/r1/submit', form());

    const upload = calls.find((call) => call.url.includes('/submit'))!;
    expect(upload.headers['x-bb-client']).toBe('1');
  });

  it('refreshes an expired token and replays the upload', async () => {
    // The whole bug: without this the entry is simply lost.
    tokenStore.set({ accessToken: 'stale-token' });
    const calls = stubFetch(1);

    await expect(api.upload('/rooms/r1/submit', form())).resolves.toEqual({ id: 'entry-1' });

    const uploads = calls.filter((call) => call.url.includes('/submit'));
    expect(uploads).toHaveLength(2);
    expect(calls.some((call) => call.url.includes('/auth/refresh'))).toBe(true);

    // The replay must carry the new token, not the one that just failed.
    expect(uploads[1]!.headers.Authorization).toBe('Bearer fresh-token');
  });

  it('sends the form again on the replay, not an empty body', async () => {
    // A retry that posts nothing would store an entry with no images, which is
    // worse than the failure it replaced.
    tokenStore.set({ accessToken: 'stale-token' });
    const calls = stubFetch(1);

    await api.upload('/rooms/r1/submit', form());

    const uploads = calls.filter((call) => call.url.includes('/submit'));
    expect(uploads[1]!.body).toBeInstanceOf(FormData);
  });

  it('gives up rather than looping when the refresh does not help', async () => {
    tokenStore.set({ accessToken: 'stale-token' });
    const calls = stubFetch(99);

    await expect(api.upload('/rooms/r1/submit', form())).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });

    // Exactly one retry — an upload that loops would re-send the files forever.
    expect(calls.filter((call) => call.url.includes('/submit'))).toHaveLength(2);
  });
});
