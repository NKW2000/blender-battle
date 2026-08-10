'use client';

import { useMutation } from '@tanstack/react-query';

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
export function useResendVerification() {
  return useMutation<void, ApiError, void>({
    mutationFn: () => api.post<void>('/auth/email/verify/resend'),
  });
}

export function useVerifyEmail() {
  return useMutation<void, ApiError, { token: string }>({
    mutationFn: (dto) => api.post<void>('/auth/email/verify', dto),
  });
}
