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

  /*
    The provider refused it.

    Worth saying out loud rather than showing "Sent": the commonest cause is a
    deployment still on a testing sender, which can only email one address. A
    user told "sent" in that situation waits for ever for a message that was
    rejected before it left.
  */
  const failed = resend.data?.result === 'send-failed';

  return (
    /*
      Stacked on a phone, one row from `sm` up.

      The previous version was a single wrapping row, which on a narrow screen
      dropped the action button and the dismiss cross onto their own line
      left-aligned under the text — reading as two stray controls belonging to
      nothing. `relative` is here so the cross can leave the flow entirely.
    */
    <div
      role="status"
      className="relative mx-auto mb-4 max-w-6xl rounded-2xl border-[3px] border-edge bg-panel-raised px-4 py-3.5 sm:flex sm:items-center sm:gap-4"
    >
      {/*
        Out of flow, pinned to the corner. It is a secondary control and should
        not sit beside the primary one competing for the same glance. `pr-8` on
        the text below reserves its column so a long line cannot run underneath.
      */}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="arcade-focus absolute right-2 top-2 rounded-lg px-2 py-1 text-sm font-extrabold leading-none text-bone-faint hover:text-bone"
      >
        ✕
      </button>

      <div className="min-w-0 flex-1 pr-8 sm:pr-0">
        <p className="font-display text-sm font-bold text-bone">Confirm your email address</p>
        <p className="mt-1 text-xs font-extrabold leading-relaxed text-bone-muted">
          {failed ? 'We could not send to ' : resend.isSuccess ? 'Sent again to ' : 'We sent a link to '}
          {/*
            The address gets its own element so it can break.

            An email is one unbroken token as far as the browser is concerned,
            and a long one on a 360px screen pushes the whole banner wider than
            the viewport — which makes the entire page scroll sideways. This is
            the one string here that is not under our control.
          */}
          <span className="break-all text-bone">{user.email}</span>
          {failed
            ? '. The mail service refused it — that usually means the address is not one this deployment is allowed to email yet. Nothing is wrong with your account.'
            : resend.isSuccess
              ? ' — check your spam folder too.'
              : '. You can still enter challenges; voting needs a confirmed address.'}
        </p>
      </div>

      {resend.isSuccess && !failed ? null : (
        // Full width on a phone, natural width beside the text from `sm` up.
        // A small button floating alone under a paragraph is easy to miss and
        // easy to mis-tap.
        <div className="mt-3 sm:mt-0 sm:shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => resend.mutate()}
            disabled={resend.isPending}
          >
            {resend.isPending ? 'Sending…' : failed ? 'Try again' : 'Send again'}
          </Button>
        </div>
      )}
    </div>
  );
}
