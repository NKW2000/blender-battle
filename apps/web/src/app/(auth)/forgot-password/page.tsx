'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ArcadeField } from '@/components/arcade/auth-parts';
import { ChunkyButton } from '@/components/arcade/chunky';
import { AuthShell } from '@/components/auth/auth-shell';
import { useForgotPassword } from '@/features/auth/use-recovery';

export default function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    /*
      `onSettled`, not `onSuccess`.

      The confirmation must not depend on the outcome. The server already
      answers identically for a registered and an unregistered address; showing
      a different screen when the request happened to fail would leak the same
      thing the endpoint was carefully designed not to.
    */
    forgot.mutate({ email: email.trim() }, { onSettled: () => setSent(true) });
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle={`If ${email.trim()} has an account, a reset link is on its way. It works once, and stops working in an hour.`}
        footer={
          <Link href="/login" className="text-sun hover:text-flame-lift">
            Back to sign in
          </Link>
        }
      >
        {/*
          No "didn't get it? resend" button. It would be throttled anyway, and
          the honest advice at this point is to check spam and re-read the
          address — a second identical email does not fix a typo.
        */}
        <p className="text-sm font-bold leading-relaxed text-haze-4">
          Nothing after a few minutes? Check spam, and make sure the address is the
          one you signed up with.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Give us the address on the account and we will send a link to set a new one."
      footer={
        <Link href="/login" className="text-sun hover:text-flame-lift">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} noValidate>
        <ArcadeField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <ChunkyButton type="submit" size="lg" className="w-full" disabled={forgot.isPending}>
          {forgot.isPending ? 'Sending…' : 'Send reset link'}
        </ChunkyButton>
      </form>
    </AuthShell>
  );
}
