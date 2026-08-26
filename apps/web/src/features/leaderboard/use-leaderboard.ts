'use client';

import type { LeaderboardEntry } from '@bb/shared';
import { useInfiniteQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * How many standings arrive per request.
 *
 * Enough to fill a screen and then some, so the first press of "Show more" is
 * not immediately needed, and small enough that the page is not carrying a
 * hundred rows it will never scroll to.
 */
const PAGE_SIZE = 25;

/**
 * The standings, a page at a time.
 *
 * This asked for a flat fifty and stopped there. The endpoint has taken `limit`
 * and `offset` from the start — it computes ranks from the offset and breaks
 * score ties on `id` precisely so pages line up — and nothing ever sent them, so
 * the fifty-first player did not exist as far as the site was concerned. On a
 * leaderboard that is not a truncated list, it is a player who cannot find
 * themselves.
 *
 * Offset paging rather than a cursor, because the server ranks by score and rank
 * is the thing being read: "start at 25" is exactly the question, and the
 * tiebreaker makes the answer stable between requests.
 *
 * Cached for a minute rather than refetched on focus: a leaderboard that
 * reshuffles while you are reading it is worse than one that is sixty seconds
 * old, and nothing here changes faster than a room takes to finish.
 */
export function useLeaderboard() {
  return useInfiniteQuery({
    queryKey: ['leaderboard', PAGE_SIZE],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<LeaderboardEntry[]>(`/leaderboard?limit=${PAGE_SIZE}&offset=${pageParam}`),
    /*
      A short page means the end.

      The endpoint answers with a plain array and no total, so the only signal
      available is the size of what came back. Asking for another page after a
      full one costs one request that returns nothing, which is the cheaper
      mistake than hiding a "Show more" that should have been there.
    */
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
    staleTime: 60_000,
  });
}
