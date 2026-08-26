import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Paging the standings.
 *
 * The endpoint has taken `limit` and `offset` since it was written — it derives
 * ranks from the offset and breaks score ties on `id` so pages line up — and the
 * hook asked for a flat fifty and stopped. The fifty-first player did not exist
 * as far as the site was concerned, which on a leaderboard is not a truncated
 * list but a player who cannot find themselves.
 */

const get = vi.fn();

vi.mock('@/lib/api/client', () => ({ api: { get: (url: string) => get(url) } }));

const { useLeaderboard } = await import('./use-leaderboard');

function entries(count: number, from = 1) {
  return Array.from({ length: count }, (_, i) => ({
    userId: `u${from + i}`,
    username: `player${from + i}`,
    rank: from + i,
    score: 1000 - (from + i),
    wins: 1,
    losses: 0,
    winRate: 100,
  }));
}

/**
 * Answers from the offset in the URL rather than a call-order chain.
 *
 * React Query can issue the first request more than once, which silently eats a
 * one-shot mock and leaves the next page resolving to nothing — a failure that
 * looks like broken paging and is not.
 */
function servePages(total: number) {
  get.mockImplementation((url: string) => {
    const offset = Number(new URL(url, 'http://x').searchParams.get('offset') ?? 0);
    const remaining = Math.max(0, total - offset);
    return Promise.resolve(entries(Math.min(25, remaining), offset + 1));
  });
}

/**
 * One client for the whole hook, built outside the wrapper component.
 *
 * A wrapper that constructs the client inline builds a fresh one on every
 * render, so the cache is discarded each time and an infinite query can never
 * accumulate a second page — which reads exactly like broken paging.
 */
function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => {
  get.mockReset();
});

describe('the standings', () => {
  it('asks for a bounded page rather than everything', async () => {
    // An unbounded list is what the server's `limit` exists to prevent.
    get.mockResolvedValue(entries(25));

    const { result } = renderHook(() => useLeaderboard(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(get).toHaveBeenCalledWith('/leaderboard?limit=25&offset=0');
  });

  it('offers another page when one comes back full', async () => {
    /*
      A full page is the only "there may be more" signal available: the endpoint
      answers with a plain array and no total. Getting this wrong in the other
      direction hides the button that should have been there.
    */
    get.mockResolvedValue(entries(25));

    const { result } = renderHook(() => useLeaderboard(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.hasNextPage).toBe(true);
  });

  it('stops when a short page arrives', async () => {
    // Otherwise "Show more" stays lit for ever on a site with nine players.
    get.mockResolvedValue(entries(9));

    const { result } = renderHook(() => useLeaderboard(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.hasNextPage).toBe(false);
  });

  it('advances the offset by a whole page', async () => {
    // The second request must start where the first ended, or rank 26 is either
    // skipped or shown twice.
    servePages(50);

    const { result } = renderHook(() => useLeaderboard(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await result.current.fetchNextPage();

    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/leaderboard?limit=25&offset=25'),
    );
  });

  /*
    Rank continuity across a page boundary is not asserted here.

    The server owns those numbers — it returns the offset plus the row's index,
    so the client never computes a rank and cannot get one wrong. What it owns
    is the offset it asks for, which the test above pins. Asserting the rest
    from here would be testing the mock.
  */
});
