'use client';

import { ApiErrorCode } from '@bb/shared';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api/client';

/**
 * The one way the app raises a passing message.
 *
 * Call sites go through here rather than reaching for `sonner` directly so that
 * the decisions below — which failures are worth interrupting someone for, how
 * they are worded, how repeats collapse — live in one place instead of being
 * re-made at every mutation.
 */

/**
 * Failures the client already resolves on its own.
 *
 * An expired access token is refreshed and the request replayed, so the user
 * never needed to know. A reused token has already revoked the session and the
 * UI is on its way to sign-in, where a toast would arrive detached from
 * anything the user could act on.
 */
const SILENT_CODES: ReadonlySet<string> = new Set([
  ApiErrorCode.UNAUTHORIZED,
  ApiErrorCode.TOKEN_EXPIRED,
  ApiErrorCode.TOKEN_REUSED,
]);

/** What to say when the failure carries no usable message of its own. */
const FALLBACK_MESSAGE = 'Something went wrong. Try again.';

function describe(error: unknown): { title: string; description?: string } | null {
  if (error instanceof ApiError) {
    if (SILENT_CODES.has(error.code)) return null;

    // Field-level validation detail is already rendered next to the offending
    // input; the toast only carries the headline so the two do not disagree.
    if (error.status >= 500) {
      return {
        title: 'The server had a problem',
        description: error.requestId ? `Reference ${error.requestId}` : undefined,
      };
    }
    return { title: error.message || FALLBACK_MESSAGE };
  }

  // A thrown TypeError from fetch means the request never reached the server —
  // worth saying plainly, because "failed to fetch" reads as a bug rather than
  // a dropped connection.
  if (error instanceof TypeError) {
    return { title: 'Cannot reach the server', description: 'Check your connection.' };
  }

  if (error instanceof Error) return { title: error.message || FALLBACK_MESSAGE };
  return { title: FALLBACK_MESSAGE };
}

export const notify = {
  success: (message: string, description?: string) =>
    toast.success(message, { description }),

  info: (message: string, description?: string) => toast(message, { description }),

  warning: (message: string, description?: string) =>
    toast.warning(message, { description }),

  /** A message you have already written. Prefer `notify.failure` for a caught error. */
  error: (message: string, description?: string) => toast.error(message, { description }),

  /**
   * A submit the form refused to send, because its own fields are not valid.
   *
   * One summary, never one per field: the per-field messages are already
   * printed beside the inputs, where they can point at what is wrong, and a
   * toast cannot. This exists because without it a blocked submit was silent —
   * the button appeared to do nothing at all when the offending field had
   * scrolled out of view.
   *
   * The fixed id means hammering submit replaces the toast rather than
   * stacking a new one each press.
   */
  invalidForm: (fieldCount: number) =>
    toast.error(
      fieldCount === 1 ? 'One field needs attention' : `${fieldCount} fields need attention`,
      { description: 'What to fix is marked in the form.', id: 'form-invalid' },
    ),

  /**
   * Surfaces a caught error, or stays quiet when it is one the app handles
   * itself. Identical failures collapse onto one toast rather than stacking:
   * three panels failing the same refresh is one problem, not three.
   */
  failure: (error: unknown) => {
    const described = describe(error);
    if (!described) return;
    toast.error(described.title, {
      description: described.description,
      id: `failure:${described.title}`,
    });
  },
};
