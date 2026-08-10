'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

import { AuthShell } from '@/components/auth/auth-shell';
import { useVerifyEmail } from '@/features/auth/use-recovery';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}

function VerifyEmail() {
  const token = useSearchParams().get('token') ?? '';
  const verify = useVerifyEmail();

  /*
    Fires once.

    A verification link is spent on use, so a second call — from a re-render, or
    from React's development double-effect — would find the token already
    redeemed and report the link as invalid to somebody who had just used it
    successfully.
  */
  const attempted = useRef(false);
  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    verify.mutate({ token });
  }, [token, verify]);

  const state = !token || verify.isError ? 'failed' : verify.isSuccess ? 'done' : 'working';

  return (
    <AuthShell
      title={
        state === 'done'
          ? 'Address confirmed'
          : state === 'failed'
            ? 'This link did not work'
            : 'Confirming…'
      }
      subtitle={
        state === 'done'
          ? 'Thanks — your account is fully set up.'
          : state === 'failed'
            ? 'It may have expired, or already been used. You can send yourself a new one from your settings.'
            : 'One moment.'
      }
      footer={
        state === 'working' ? null : (
          <Link href="/rooms" className="text-sun hover:text-flame-lift">
            Go to rooms
          </Link>
        )
      }
    >
      <span />
    </AuthShell>
  );
}
