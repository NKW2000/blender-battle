'use client';

import type { ChallengeAsset, Difficulty, TagSummary } from '@bb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ApiError } from '@/lib/api/client';
import { notify } from '@/lib/notify';

export type EventPhase = 'upcoming' | 'open' | 'voting' | 'finished' | 'not-an-event';

export interface EventSummary {
  id: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  category: { id: string; name: string } | null;
  tags: TagSummary[];
  estimatedMinutes: number;
  rewardXp: number;
  coverImageUrl: string | null;
  shortDescription: string;
  startDate: string | null;
  endDate: string | null;
  votingEndsAt: string | null;
  winnerEntryId: string | null;
  phase: EventPhase;
  serverNow: string;
}

export interface EventEntry {
  id: string;
  userId: string;
  username: string | null;
  /** Final render, 1024×1024. */
  imageUrl: string;
  /** Workspace shot, 1024×1024. Null while blind (voting) and on legacy entries. */
  workspacePhotoUrl: string | null;
  notes: string | null;
  voteCount: number;
  submittedAt: string;
}

export interface EventDetail extends EventSummary {
  referenceImageUrl: string | null;
  objectives: string[];
  /*
    The written brief, in full.

    The event page used to show the title and link out to `/challenges/[slug]`
    to read the rules — away from the page you opened, and back again to enter.
    One subject, one page.
  */
  description: string;
  rules: string | null;
  allowedAssets: string | null;
  forbiddenAssets: string | null;
  blenderVersion: string | null;
  assets: ChallengeAsset[];
  myEntryId: string | null;
  /*
    Your own entry, in full.

    `myEntryId` said one existed and nothing about what was in it, so after a
    reload the upload panel looked exactly as it had before submitting — which
    reads as the entry having been lost. Rooms already returned this.
  */
  myEntry: {
    id: string;
    imageUrl: string;
    workspacePhotoUrl: string | null;
    notes: string | null;
    submittedAt: string;
  } | null;
  myVoteEntryId: string | null;
  entries: EventEntry[];
}

export const eventKeys = {
  list: ['events', 'list'] as const,
  detail: (id: string) => ['events', 'detail', id] as const,
};

export function useEvents() {
  return useQuery({
    queryKey: eventKeys.list,
    queryFn: () => api.get<EventSummary[]>('/challenge-events'),
    refetchInterval: 30_000,
  });
}

/**
 * One event, polled while it is live.
 *
 * Every phase boundary is a date on the server, so the client has to keep asking
 * — the window opens, closes, and resolves whether or not this tab acts. A
 * finished event never changes again, so polling stops there.
 */
export function useEvent(id: string | null, initialData?: EventDetail) {
  return useQuery({
    queryKey: eventKeys.detail(id ?? ''),
    queryFn: () => api.get<EventDetail>(`/challenge-events/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.phase === 'finished' ? false : 15_000),
    /*
      Seeded from the server render, which was made without credentials — so
      `myEntryId` and `myVoteEntryId` are null in it even for someone who has
      entered.

      `initialDataUpdatedAt: 0` marks that copy as already stale, so the query
      refetches immediately on mount with the visitor's own token and fills
      those in. Without it a signed-in entrant would be shown the anonymous
      view until the first poll, and the ballot would refuse a vote they appear
      to be allowed to cast.
    */
    initialData,
    initialDataUpdatedAt: 0,
  });
}

/**
 * Enter the event.
 *
 * Multipart through the API, not browser-direct to the CDN: the deadline is
 * checked server-side, and an unsigned upload preset would be a public write
 * endpoint into the storage account.
 */
export function useEnterEvent(challengeId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    EventEntry,
    ApiError,
    { image: File; workspace: File; notes?: string }
  >({
    /*
      Through `api.upload`, for the same reason as the room's submit: a
      hand-rolled fetch has no refresh-and-retry, so an entry sent more than
      fifteen minutes after the last token refresh was rejected as unauthorised
      and silently lost.
    */
    mutationFn: ({ image, workspace, notes }) => {
      const form = new FormData();
      form.append('image', image);
      form.append('workspace', workspace);
      if (notes) form.append('notes', notes);

      return api.upload<EventEntry>(`/challenge-events/${challengeId}/entries`, form);
    },
    /*
      Say so.

      Every other mutation in the application confirms itself and this one did
      not, so a submission that worked perfectly was indistinguishable from a
      button that did nothing — which is exactly how it was reported.
    */
    onSuccess: () => {
      notify.success('Entry submitted');
      void queryClient.invalidateQueries({ queryKey: eventKeys.detail(challengeId) });
    },
  });
}

export function useVoteEvent(challengeId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ entryId: string }, ApiError, string>({
    mutationFn: (entryId) =>
      api.post(`/challenge-events/${challengeId}/vote`, { entryId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.detail(challengeId) });
    },
  });
}

/**
 * Manager-only scheduling. The submission and vote windows are sent as lengths
 * in hours; the server derives the two deadlines so they can never be out of
 * order. The UI offers a days/hours unit and multiplies to hours before sending.
 */
export function useScheduleEvent(challengeId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    EventDetail,
    ApiError,
    { startDate: string; submitHours: number; voteHours: number }
  >({
    mutationFn: (body) => api.post(`/challenge-events/${challengeId}/schedule`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.detail(challengeId) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.list });
    },
  });
}

export function useUnscheduleEvent(challengeId: string) {
  const queryClient = useQueryClient();

  return useMutation<EventDetail, ApiError, void>({
    mutationFn: () => api.post(`/challenge-events/${challengeId}/unschedule`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.detail(challengeId) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.list });
    },
  });
}

/** Freeze the winner by hand, before the vote deadline. Manager only. */
export function useCloseEvent(challengeId: string) {
  const queryClient = useQueryClient();

  return useMutation<EventDetail, ApiError, void>({
    mutationFn: () => api.post(`/challenge-events/${challengeId}/close`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.detail(challengeId) });
    },
  });
}
