'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { PASSWORD_MIN_LENGTH } from '@bb/shared';

import { ArcadeField } from '@/components/arcade/auth-parts';
import { ChunkyButton } from '@/components/arcade/chunky';
import { AuthShell } from '@/components/auth/auth-shell';
import { useResetPassword } from '@/features/auth/use-recovery';
import { notify } from '@/lib/notify';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const reset = useResetPassword();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // A link with no token is a broken link, and saying so immediately is kinder
  // than a form that can only fail on submit.
  if (!token) {
    return (
      <AuthShell
        title="This link is incomplete"
        subtitle="It is missing its token, which usually means the email client cut it short. Ask for a new one."
        footer={
          <Link href="/forgot-password" className="text-sun hover:text-flame-lift">
            Request a new link
          </Link>
        }
      >
        <span />
      </AuthShell>
    );
  }

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= PASSWORD_MIN_LENGTH && confirm === password;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    reset.mutate(
      { token, password },
      {
        onSuccess: () => {
          // Every session was revoked server-side, including any the attacker
          // held, so there is nothing to return to but the sign-in page.
          notify.success('Password changed', 'Sign in with your new password.');
          router.replace('/login');
        },
      },
    );
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Setting it signs out every device that is currently signed in — including whoever you are worried about."
    >
      <form onSubmit={submit} noValidate>
        <ArcadeField
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={password}
          error={tooShort ? 'too short' : undefined}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          onChange={(event) => setPassword(event.target.value)}
        />
        <ArcadeField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={confirm}
          error={mismatch ? 'does not match' : undefined}
          onChange={(event) => setConfirm(event.target.value)}
        />

        <ChunkyButton
          type="submit"
          size="lg"
          className="w-full"
          disabled={!canSubmit || reset.isPending}
        >
          {reset.isPending ? 'Saving…' : 'Set password'}
        </ChunkyButton>
      </form>
    </AuthShell>
  );
}
