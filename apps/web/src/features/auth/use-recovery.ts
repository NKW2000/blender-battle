'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { sessionKeys } from '@/features/auth/use-session';
import { api, type ApiError } from '@/lib/api/client';

/**
 * Account recovery.
 *
 * All three call unauthenticated endpoints, so none of them touches the session
 * cache — a successful reset deliberately leaves the user signed out, because
 * the server has just revoked every one of their sessions.
 */

/** Always resolves, whether or not the address is registered. */
export function useForgotPassword() {
  return useMutation<void, ApiError, { email: string }>({
    mutationFn: (dto) => api.post<void>('/auth/password/forgot', dto),
  });
}

export function useResetPassword() {
  return useMutation<void, ApiError, { token: string; password: string }>({
    mutationFn: (dto) => api.post<void>('/auth/password/reset', dto),
  });
}

/**
 * Ask for another verification link.
 *
 * Authenticated and scoped server-side to the caller's own address — there is
 * no user id in the request, so it cannot be used to make the service email
 * somebody else.
 */
export type VerificationSendResult = 'sent' | 'already-verified' | 'send-failed';

export function useResendVerification() {
  const queryClient = useQueryClient();

  return useMutation<{ result: VerificationSendResult }, ApiError, void>({
    mutationFn: () => api.post<{ result: VerificationSendResult }>('/auth/email/verify/resend'),
    onSuccess: (data) => {
      /*
        `already-verified` means this client's copy of the session is stale —
        most often because a completed password reset confirmed the address on
        the server. Refetching makes the banner disappear on its own rather
        than leaving someone pressing a button that will never do anything.
      */
      if (data.result === 'already-verified') {
        void queryClient.invalidateQueries({ queryKey: sessionKeys.me });
      }
    },
  });
}

export function useVerifyEmail() {
  return useMutation<void, ApiError, { token: string }>({
    mutationFn: (dto) => api.post<void>('/auth/email/verify', dto),
  });
}

