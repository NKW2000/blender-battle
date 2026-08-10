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

/**
 * Pulls the readable messages out of a react-hook-form error object, in the
 * order the fields were declared.
 *
 * Typed loosely on purpose: `FieldErrors` is generic over each form's own value
 * type, and threading that through would make every call site name its schema
 * for no gain — all this needs is the `message` on each entry.
 */
export function collectFormMessages(fieldErrors: Record<string, unknown>): string[] {
  return Object.values(fieldErrors)
    .map((entry) =>
      entry && typeof entry === 'object' && 'message' in entry
        ? String((entry as { message?: unknown }).message ?? '')
        : '',
    )
    .filter(Boolean);
}

export const notify = {
  success: (message: string, description?: string) =>
    toast.success(message, { description }),

  info: (message: string, description?: string) => toast(message, { description }),


  /** A message you have already written. Prefer `notify.failure` for a caught error. */
  error: (message: string, description?: string) => toast.error(message, { description }),

  /**
   * A submit the form refused to send, because its own fields are not valid.
   *
   * This carries the wording, because the fields no longer do: an invalid input
   * is marked by its outline alone, so if the messages were not here they would
   * be nowhere. One toast for the whole form rather than one per field — a
   * stack of them in the corner is harder to read than a list.
   *
   * The fixed id means hammering submit replaces the toast rather than stacking
   * a new one each press.
   */
  invalidForm: (messages: string[]) => {
    const [first, ...rest] = messages;
    toast.error(first ?? FALLBACK_MESSAGE, {
      description: rest.length ? rest.join('\n') : undefined,
      id: 'form-invalid',
    });
  },

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
