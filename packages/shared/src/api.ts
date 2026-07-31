import type { ApiErrorCode } from './enums.js';

/**
 * Every REST response uses this envelope, success or failure. The backend applies
 * it centrally (ResponseInterceptor + AllExceptionsFilter) so controllers never
 * build it by hand.
 */
export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  data: null;
  error: {
    code: ApiErrorCode;
    /** Field-level messages, present only for VALIDATION_FAILED. */
    details?: Record<string, string[]>;
    /** Correlates a client-side report with the server log line. */
    requestId: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/**
 * Cursor pagination. Offset pagination is deliberately not offered: on tables that
 * receive concurrent inserts (activity logs, battle history, leaderboard) OFFSET
 * both skips and repeats rows across pages, and degrades linearly with depth.
 *
 * `nextCursor` is an opaque base64 value — clients must round-trip it unmodified
 * and never attempt to construct or parse one.
 */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CursorQuery {
  cursor?: string;
  limit?: number;
}
