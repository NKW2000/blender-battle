'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useResendVerification } from '@/features/auth/use-recovery';
import { useSession } from '@/features/auth/use-session';

/**
 * Tells an unverified account what it cannot do, and offers the fix.
 *
 * Shown rather than silently enforcing, because the enforcement point is
 * deliberately far from registration: you can browse, enter a challenge and be
 * judged without confirming an address, and only voting is refused. Someone who
 * discovers that at the ballot, three days after signing up, with no warning
 * and no obvious remedy, would reasonably conclude the site is broken.
 *
 * Dismissible for the session only, not persisted. This is a state the account
 * is actually in and the reminder should come back — but a banner that cannot
 * be closed while you are trying to read the page underneath is its own
 * problem.
 */
export function VerifyEmailBanner() {
  const { user } = useSession();
  const resend = useResendVerification();
  const [dismissed, setDismissed] = useState(false);

  // Nothing to say to a signed-out visitor or a confirmed account.
  if (!user || user.emailVerifiedAt || dismissed) return null;

  return (
    <div
      role="status"
      className="mx-auto mb-4 flex max-w-6xl flex-wrap items-center gap-3 rounded-2xl border-[3px] border-edge bg-panel-raised px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-bold text-bone">Confirm your email address</p>
        <p className="mt-1 text-xs font-extrabold leading-relaxed text-bone-muted">
          {resend.isSuccess
            ? `Sent. Check ${user.email} — and your spam folder.`
            : `We sent a link to ${user.email}. You can enter challenges without it, but voting needs a confirmed address.`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {resend.isSuccess ? null : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => resend.mutate()}
            disabled={resend.isPending}
          >
            {resend.isPending ? 'Sending…' : 'Send again'}
          </Button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="arcade-focus rounded-lg px-2 py-1 text-xs font-extrabold text-bone-faint hover:text-bone"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
