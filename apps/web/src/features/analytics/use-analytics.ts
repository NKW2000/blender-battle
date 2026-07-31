'use client';

import type {
  ActivityLogEntry,
  AdminMetrics,
  CursorPage,
  ManagerMetrics,
} from '@bb/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

// The leaderboard hooks were removed with the ranking system — the endpoints
// they called no longer exist on the API.
export const analyticsKeys = {
  adminMetrics: ['admin', 'metrics'] as const,
  managerMetrics: ['manager', 'metrics'] as const,
  activity: (action?: string) => ['admin', 'activity', action ?? 'all'] as const,
};

export function useAdminMetrics() {
  return useQuery({
    queryKey: analyticsKeys.adminMetrics,
    queryFn: () => api.get<AdminMetrics>('/admin/metrics'),
    // The server serves a snapshot refreshed every five minutes; polling faster
    // than that would return the same numbers and waste the round trip.
    refetchInterval: 60_000,
  });
}

export function useManagerMetrics() {
  return useQuery({
    queryKey: analyticsKeys.managerMetrics,
    queryFn: () => api.get<ManagerMetrics>('/manager/metrics'),
  });
}

export function useActivityLog(action?: string) {
  return useInfiniteQuery({
    queryKey: analyticsKeys.activity(action),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam);
      if (action) params.set('action', action);
      return api.get<CursorPage<ActivityLogEntry>>(`/admin/activity?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
