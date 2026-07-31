'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthSession, SelfUserProfile } from '@bb/shared';
import { useRouter } from 'next/navigation';

import { api, ApiError } from '@/lib/api/client';
import { tokenStore } from '@/lib/api/token-store';
import type { LoginInput, RegisterInput } from '@/lib/validation/auth.schema';

/**
 * Server state lives in TanStack Query, never mirrored into Zustand.
 *
 * The signed-in user IS server state: it can be changed by an admin, expire, or
 * be revoked. Copying it into a client store creates a second version that goes
 * stale silently, and reconciling the two is a bug factory. Zustand is reserved
 * for state the server has no opinion about — open menus, drafts, UI flags.
 */

export const sessionKeys = {
  me: ['session', 'me'] as const,
};

export function useSession() {
  const query = useQuery({
    queryKey: sessionKeys.me,
    queryFn: () => api.get<SelfUserProfile>('/auth/me'),
    // Only attempt if a refresh token exists — otherwise every anonymous visitor
    // fires a guaranteed 401 on page load.
    enabled: typeof window !== 'undefined' && Boolean(tokenStore.getRefreshToken()),
    retry: false,
    staleTime: 60_000,
  });

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isAuthenticated: Boolean(query.data),
  };
}

export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation<AuthSession, ApiError, LoginInput>({
    mutationFn: (input) => api.post<AuthSession>('/auth/login', input),
    onSuccess: (session) => {
      tokenStore.set(session);
      queryClient.setQueryData(sessionKeys.me, session.user);
      router.push('/rooms');
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation<AuthSession, ApiError, RegisterInput>({
    mutationFn: (input) => api.post<AuthSession>('/auth/register', input),
    onSuccess: (session) => {
      tokenStore.set(session);
      queryClient.setQueryData(sessionKeys.me, session.user);
      router.push('/rooms');
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      const refreshToken = tokenStore.getRefreshToken();
      if (refreshToken) {
        // Best effort: if the call fails the local credentials are dropped anyway,
        // so the user is signed out here regardless of the server's answer.
        await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
      }
    },
    onSettled: () => {
      tokenStore.clear();
      queryClient.clear();
      router.push('/login');
    },
  });
}
