'use client';

import type { LeaderboardEntry } from '@bb/shared';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * The standings.
 *
 * Cached for a minute rather than refetched on focus: a leaderboard that
 * reshuffles while you are reading it is worse than one that is sixty seconds
 * old, and nothing here changes faster than a room takes to finish.
 */
export function useLeaderboard(limit = 50) {
  return useQuery({
    queryKey: ['leaderboard', limit],
    queryFn: () => api.get<LeaderboardEntry[]>(`/leaderboard?limit=${limit}`),
    staleTime: 60_000,
  });
}
