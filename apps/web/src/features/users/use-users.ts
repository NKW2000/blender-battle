'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminUserListItem,
  CursorPage,
  PortfolioItem,
  PublicUserProfile,
  Role,
  SelfUserProfile,
  UserStatus,
} from '@bb/shared';
import { toast } from 'sonner';

import { api, type ApiError } from '@/lib/api/client';
import { sessionKeys } from '@/features/auth/use-session';

export const userKeys = {
  profile: (username: string) => ['users', 'profile', username] as const,
  portfolio: (username: string) => ['users', 'portfolio', username] as const,
  adminList: (filters: Record<string, unknown>) => ['users', 'admin', filters] as const,
};

export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: userKeys.profile(username),
    queryFn: () => api.get<PublicUserProfile>(`/users/by-username/${username}`),
  });
}

/**
 * The artist's finished work.
 *
 * Long `staleTime` on purpose: the meshes behind it are downloaded into a WebGL
 * scene, and a background refetch that swapped the array would tear the scene
 * down and re-download every model for no visible gain. A portfolio only changes
 * when a challenge resolves, which is not something to poll for.
 */
export function usePortfolio(username: string) {
  return useQuery({
    queryKey: userKeys.portfolio(username),
    queryFn: () => api.get<PortfolioItem[]>(`/users/by-username/${username}/portfolio`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation<SelfUserProfile, ApiError, Record<string, unknown>>({
    mutationFn: (input) => api.patch<SelfUserProfile>('/users/me', input),
    onSuccess: (user) => {
      queryClient.setQueryData(sessionKeys.me, user);
      queryClient.invalidateQueries({ queryKey: userKeys.profile(user.username) });
      // The confirmation uses the same verb as the control that triggered it.
      toast.success('Profile saved');
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();

  return useMutation<SelfUserProfile, ApiError, File>({
    mutationFn: (file) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<SelfUserProfile>('/users/me/avatar', formData);
    },
    onSuccess: (user) => {
      queryClient.setQueryData(sessionKeys.me, user);
      toast.success('Avatar updated');
    },
    onError: (error) => toast.error(error.message),
  });
}

/**
 * Admin list. Infinite rather than paged because the cursor is opaque and cannot
 * address an arbitrary page — the API shape and the UI affordance agree.
 */
export function useAdminUsers(filters: { role?: Role; status?: UserStatus; search?: string }) {
  return useInfiniteQuery({
    queryKey: userKeys.adminList(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam);
      if (filters.role) params.set('role', filters.role);
      if (filters.status) params.set('status', filters.status);
      if (filters.search) params.set('search', filters.search);

      return api.get<CursorPage<AdminUserListItem>>(`/users?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useChangeUserRole() {
  const queryClient = useQueryClient();

  return useMutation<AdminUserListItem, ApiError, { id: string; role: Role; reason: string }>({
    mutationFn: ({ id, role, reason }) =>
      api.patch<AdminUserListItem>(`/users/${id}/role`, { role, reason }),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ['users', 'admin'] });
      toast.success(`${user.username} is now ${user.role}`);
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useChangeUserStatus() {
  const queryClient = useQueryClient();

  return useMutation<
    AdminUserListItem,
    ApiError,
    { id: string; status: UserStatus; reason: string; suspendedUntil?: string }
  >({
    mutationFn: ({ id, ...body }) => api.patch<AdminUserListItem>(`/users/${id}/status`, body),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ['users', 'admin'] });
      toast.success(`${user.username} is now ${user.status}`);
    },
    onError: (error) => toast.error(error.message),
  });
}
