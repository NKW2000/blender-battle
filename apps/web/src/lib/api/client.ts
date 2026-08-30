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
  try {
    /*
      No body, and no token in it.

      The credential is the httpOnly refresh cookie, which the browser attaches
      because of `credentials: 'include'`. JavaScript cannot read it, so this
      request cannot name it — which is exactly why there is nothing here for an
      XSS payload to steal.

      `x-bb-client` is the CSRF defence. A custom header forces a preflight, and
      a preflight from an origin outside the API's allowlist is refused by the
      browser before this request is ever sent. See `SameSiteGuard` on the API.
    */
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-bb-client': '1' },
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

  /*
    After a page load the access token is gone — it lives in memory only — and
    whether a session exists at all is now something only the server knows,
    because the refresh cookie is invisible to this code.

    So the attempt is unconditional rather than guarded on a stored token. It
    costs one request that returns 401 for a signed-out visitor, and it saves a
    signed-in one a guaranteed failed request on every cold load.
  */
  if (!skipRefresh && !tokenStore.getAccessToken()) {
    await refreshOnce();
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    // Sends the refresh cookie on the auth routes it is scoped to, and is
    // required for the API to accept the `Set-Cookie` that creates it.
    credentials: 'include',
    headers: {
      // The browser must set its own multipart boundary, so Content-Type is
      // omitted for FormData.
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      /*
        Marks the request as coming from the app.

        `SameSiteGuard` requires it on the endpoints that authenticate with the
        refresh cookie. Sent on everything rather than only those two, so a new
        cookie-authenticated endpoint cannot be added and then fail for the one
        caller that forgot the header.

        Its value carries no meaning and is not a secret — a custom header
        forces a CORS preflight, and it is the preflight, checked against the
        API's origin allowlist, that does the actual work.
      */
      'x-bb-client': '1',
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
    !skipRefresh
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

  /**
   * A GET that does not wait for the session to be re-established first.
   *
   * Every other call blocks on `refreshOnce()` when there is no access token in
   * memory, which after any cold load is all of them. For an endpoint whose
   * answer does not depend on who is asking, that is a wait for nothing — and
   * for a signed-out visitor it is a wait for a refresh that is about to 401.
   *
   * Only for endpoints that return the same thing to everyone. An endpoint that
   * says more to a signed-in viewer would answer as though nobody were signed
   * in, which is worse than answering slowly.
   */
  getPublic: <T>(path: string) => send<T>(path, { method: 'GET', skipRefresh: true }),
  post: <T>(path: string, body?: unknown) => send<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => send<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => send<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    send<T>(path, { method: 'POST', body: formData }),
};
