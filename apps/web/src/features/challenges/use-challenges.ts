'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CategorySummary,
  ChallengeDetail,
  ChallengeStatus,
  ChallengeSummary,
  CursorPage,
  Difficulty,
} from '@bb/shared';
import { notify } from '@/lib/notify';

import { api, type ApiError } from '@/lib/api/client';

export interface ChallengeFilters {
  categoryId?: string;
  difficulty?: Difficulty;
  tag?: string;
  search?: string;
  status?: ChallengeStatus;
  mine?: boolean;
}

export const challengeKeys = {
  all: ['challenges'] as const,
  list: (filters: ChallengeFilters) => ['challenges', 'list', filters] as const,
  detail: (slug: string) => ['challenges', 'detail', slug] as const,
  categories: ['challenges', 'categories'] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: challengeKeys.categories,
    queryFn: () => api.get<CategorySummary[]>('/challenges/categories'),
    // The seeded set changes about never; refetching it on every mount is waste.
    staleTime: 60 * 60 * 1000,
  });
}

export function useChallenges(filters: ChallengeFilters) {
  return useInfiniteQuery({
    queryKey: challengeKeys.list(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam);
      if (filters.categoryId) params.set('categoryId', filters.categoryId);
      if (filters.difficulty) params.set('difficulty', filters.difficulty);
      if (filters.tag) params.set('tag', filters.tag);
      if (filters.search) params.set('search', filters.search);
      if (filters.status) params.set('status', filters.status);
      if (filters.mine) params.set('mine', 'true');

      return api.get<CursorPage<ChallengeSummary>>(`/challenges?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/**
 * One brief.
 *
 * `initialData` is the copy the server rendered with. Passing it means the page
 * paints its content immediately instead of flashing a skeleton over markup the
 * visitor can already see, and the query refetches in the background to pick up
 * anything that changed since.
 */
export function useChallenge(slug: string, initialData?: ChallengeDetail) {
  return useQuery({
    queryKey: challengeKeys.detail(slug),
    queryFn: () => api.get<ChallengeDetail>(`/challenges/${slug}`),
    enabled: Boolean(slug),
    initialData,
    // Without this the server copy counts as fresh forever and a manager who
    // publishes would keep seeing the draft they arrived with.
    staleTime: 30_000,
  });
}

// The client-side draw hook was removed with the standalone /draw page. The
// server still draws a challenge into a room at kickoff, but that happens inside
// the rooms service — no browser ever calls the draw endpoint directly.

export function useCreateChallenge() {
  const queryClient = useQueryClient();

  return useMutation<ChallengeDetail, ApiError, Record<string, unknown>>({
    mutationFn: (input) => api.post<ChallengeDetail>('/challenges', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: challengeKeys.all });
      notify.success('Challenge created');
    },
    onError: (error) => notify.error(error.message),
  });
}

export function useUpdateChallenge(slug: string) {
  const queryClient = useQueryClient();

  return useMutation<ChallengeDetail, ApiError, { id: string; data: Record<string, unknown> }>({
    mutationFn: ({ id, data }) => api.patch<ChallengeDetail>(`/challenges/${id}`, data),
    onSuccess: (challenge) => {
      queryClient.setQueryData(challengeKeys.detail(slug), challenge);
      queryClient.invalidateQueries({ queryKey: challengeKeys.all });
      notify.success('Challenge saved');
    },
    onError: (error) => notify.error(error.message),
  });
}

/** Publish and archive share a shape; the verb differs and so does the toast. */
export function useChallengeLifecycle() {
  const queryClient = useQueryClient();

  const publish = useMutation<ChallengeDetail, ApiError, string>({
    mutationFn: (id) => api.post<ChallengeDetail>(`/challenges/${id}/publish`),
    onSuccess: (challenge) => {
      queryClient.invalidateQueries({ queryKey: challengeKeys.all });
      notify.success(`${challenge.title} is live`);
    },
    onError: (error) => notify.error(error.message),
  });

  const archive = useMutation<ChallengeDetail, ApiError, string>({
    mutationFn: (id) => api.post<ChallengeDetail>(`/challenges/${id}/archive`),
    onSuccess: (challenge) => {
      queryClient.invalidateQueries({ queryKey: challengeKeys.all });
      notify.success(`${challenge.title} archived`);
    },
    onError: (error) => notify.error(error.message),
  });

  return { publish, archive };
}

export function useUploadChallengeAsset(slug: string) {
  const queryClient = useQueryClient();

  return useMutation<
    ChallengeDetail,
    ApiError,
    { id: string; file: File; type: 'reference_image' | 'reference_file' }
  >({
    mutationFn: ({ id, file, type }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      return api.upload<ChallengeDetail>(`/challenges/${id}/assets`, formData);
    },
    onSuccess: (challenge) => {
      queryClient.setQueryData(challengeKeys.detail(slug), challenge);
      notify.success('Attachment added');
    },
    onError: (error) => notify.error(error.message),
  });
}

export function useRemoveChallengeAsset(slug: string) {
  const queryClient = useQueryClient();

  return useMutation<ChallengeDetail, ApiError, { id: string; assetId: string }>({
    mutationFn: ({ id, assetId }) =>
      api.delete<ChallengeDetail>(`/challenges/${id}/assets/${assetId}`),
    onSuccess: (challenge) => {
      queryClient.setQueryData(challengeKeys.detail(slug), challenge);
      notify.success('Attachment removed');
    },
    onError: (error) => notify.error(error.message),
  });
}
