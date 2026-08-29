'use client';

import type {
  AdminMetrics,
  ManagerMetrics,
} from '@bb/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

import { api, type ApiError } from '@/lib/api/client';

// The leaderboard hooks were removed with the ranking system — the endpoints
// they called no longer exist on the API.
export const analyticsKeys = {
  adminMetrics: ['admin', 'metrics'] as const,
  managerMetrics: ['manager', 'metrics'] as const,
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

/**
 * Asks the API to open the mail connection and authenticate.
 *
 * A mutation rather than a query because it is an action with a side effect on
 * a third party — it should run when an admin presses the button, not whenever
 * React decides to refetch.
 */
export function useMailCheck() {
  return useMutation<{ ok: boolean; detail: string }, ApiError, void>({
    mutationFn: () => api.get<{ ok: boolean; detail: string }>('/admin/mail/check'),
  });
}
