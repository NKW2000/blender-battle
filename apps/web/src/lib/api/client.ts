import { ApiErrorCode, type ApiResponse, type AuthTokens } from '@bb/shared';

import { tokenStore } from './token-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Error carrying the server's machine-readable code and field details. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Record<string, string[]>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Set for the refresh call itself, to stop it from recursing into refresh. */
  skipRefresh?: boolean;
}

/**
 * Single in-flight refresh promise.
 *
 * Without this, five components hitting 401 at the same moment fire five
 * rotations. The backend's reuse detection would correctly read the second
 * rotation of the same token as theft and revoke the session — the client would
 * log itself out. Concurrent 401s must therefore share one refresh.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      tokenStore.clear();
      return false;
    }

    const payload = (await response.json()) as ApiResponse<AuthTokens>;
    if (!payload.success) {
      tokenStore.clear();
      return false;
    }

    tokenStore.set(payload.data);
    return true;
  } catch {
    tokenStore.clear();
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function send<T>(path: string, options: RequestOptions): Promise<T> {
  const { body, skipRefresh, headers, ...rest } = options;
  const isFormData = body instanceof FormData;

  // After a page load the access token is gone — it lives in memory only — while
  // the refresh token persisted. Redeem it up front rather than spending a
  // guaranteed 401 to discover the same thing.
  if (!skipRefresh && !tokenStore.getAccessToken() && tokenStore.getRefreshToken()) {
    await refreshOnce();
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      // The browser must set its own multipart boundary, so Content-Type is
      // omitted for FormData.
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(tokenStore.getAccessToken()
        ? { Authorization: `Bearer ${tokenStore.getAccessToken()}` }
        : {}),
      ...headers,
    },
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json()) as ApiResponse<T>;

  if (payload.success) return payload.data;

  // Rejected for authentication: refresh once, then replay the original request.
  // Both codes must be handled — TOKEN_EXPIRED when a token was sent and had
  // aged out, plain UNAUTHORIZED when none was sent at all.
  if (
    (payload.error.code === ApiErrorCode.TOKEN_EXPIRED ||
      payload.error.code === ApiErrorCode.UNAUTHORIZED) &&
    !skipRefresh &&
    tokenStore.getRefreshToken()
  ) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      return send<T>(path, { ...options, skipRefresh: true });
    }
  }

  // TOKEN_REUSED means the backend revoked the whole session for security. There
  // is nothing to retry — drop the credentials and let the UI route to sign-in.
  if (payload.error.code === ApiErrorCode.TOKEN_REUSED) {
    tokenStore.clear();
  }

  throw new ApiError(
    payload.error.code,
    payload.message,
    response.status,
    payload.error.details,
    payload.error.requestId,
  );
}

export const api = {
  get: <T>(path: string) => send<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => send<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => send<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => send<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    send<T>(path, { method: 'POST', body: formData }),
};
