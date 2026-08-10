'use client';

import { useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import { PanelIcon } from '@/components/ui/panel';
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
      /*
        On the arcade language, and no longer a thin strip.

        At desktop width this was a low bar of small grey text pinned across the
        whole 1152px column — it read as chrome, which is exactly the wrong
        reading for the one message telling you an action is incomplete. It is
        now a block like every other surface, with the warning icon carrying the
        meaning at a glance, and it stops at a readable width rather than
        stretching a two-line sentence across the full page.
      */
      className="relative mx-auto mb-5 flex max-w-3xl flex-col gap-4 rounded-[22px] border-[3px] border-sun bg-sun/8 px-5 py-4 sm:flex-row sm:items-center sm:gap-5"
      style={{ boxShadow: '0 8px 0 var(--color-ink)' }}
    >
      <PanelIcon tone="sun">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M3.5 7l8.5 6 8.5-6" />
        </svg>
      </PanelIcon>
      {/*
        Out of flow, pinned to the corner. It is a secondary control and should
        not sit beside the primary one competing for the same glance. `pr-8` on
        the text below reserves its column so a long line cannot run underneath.
      */}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="arcade-focus absolute right-2.5 top-2.5 rounded-lg px-2 py-1 text-sm font-extrabold leading-none text-haze-5 hover:text-cream"
      >
        ✕
      </button>

      <div className="min-w-0 flex-1 pr-8 sm:pr-2">
        <p className="font-display text-base font-bold text-cream">Confirm your email address</p>
        <p className="mt-1 text-[13px] font-extrabold leading-relaxed text-haze">
          {failed ? 'We could not send to ' : resend.isSuccess ? 'Sent again to ' : 'We sent a link to '}
          {/*
            The address gets its own element so it can break.

            An email is one unbroken token as far as the browser is concerned,
            and a long one on a 360px screen pushes the whole banner wider than
            the viewport — which makes the entire page scroll sideways. This is
            the one string here that is not under our control.
          */}
          <span className="break-all text-sun">{user.email}</span>
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
        <div className="sm:shrink-0">
          <ChunkyButton
            size="sm"
            tone="cream"
            className="w-full sm:w-auto"
            onClick={() => resend.mutate()}
            disabled={resend.isPending}
          >
            {resend.isPending ? 'Sending…' : failed ? 'Try again' : 'Send again'}
          </ChunkyButton>
        </div>
      )}
    </div>
  );
}
