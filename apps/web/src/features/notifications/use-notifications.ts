'use client';

import { type CursorPage, type NotificationItem } from '@bb/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api/client';

export const notificationKeys = {
  list: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
};

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: notificationKeys.list,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam);
      return api.get<CursorPage<NotificationItem>>(`/notifications?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    // This poll is now the only delivery signal — the socket gateway it used to
    // back up was removed with live battles — so it runs often enough that a new
    // notification surfaces within a reasonable window rather than two minutes.
    refetchInterval: 30_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post<void>(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unread });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<void>('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unread });
    },
  });
}

/**
 * Listens for pushed notifications on the user's personal room.
 *
 * Mounted once in the app shell rather than per page, so a notification arriving
 * while the user is anywhere in the app surfaces immediately. The push only
 * invalidates the cached queries — the row is already persisted server-side, so
 * this is a freshness signal, not the delivery itself.
 */
export function useNotificationListener(enabled: boolean) {
  const queryClient = useQueryClient();
  const unread = useUnreadCount();
  // Remembers the last count seen, so a *rise* is what triggers a toast rather
  // than the count merely being non-zero on every poll.
  const lastCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const count = unread.data?.count ?? 0;
    const previous = lastCountRef.current;
    lastCountRef.current = count;

    // First reading only establishes the baseline — an unread backlog present at
    // sign-in is not "new" and must not fire a toast.
    if (previous === null || count <= previous) return;

    // A genuinely new notification arrived. Pull the freshest row for its text
    // and surface it; the list itself refreshes on its own poll.
    void queryClient
      .fetchQuery({
        queryKey: notificationKeys.list,
        queryFn: () => api.get<CursorPage<NotificationItem>>('/notifications'),
      })
      .then((page) => {
        const latest = page.items[0];
        if (latest && !latest.readAt) {
          toast(latest.title, { description: latest.body ?? undefined });
        }
      })
      .catch(() => {
        // A missed toast is cosmetic; the badge count is already correct.
      });
  }, [enabled, unread.data?.count, queryClient]);
}
