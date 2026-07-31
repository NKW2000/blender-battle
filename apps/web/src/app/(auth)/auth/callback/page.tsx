'use client';

import type { AuthSession } from '@bb/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api/client';
import { tokenStore } from '@/lib/api/token-store';
import { sessionKeys } from '@/features/auth/use-session';

/**
 * Where a provider sign-in lands.
 *
 * The URL carries a single-use code, never tokens. This page trades it for the
 * real session over HTTPS and then replaces the history entry, so the code does
 * not survive in the back button or get sent as a Referer to the next page.
 */
export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<p className="eyebrow animate-pulse">Signing in</p>}>
      <CallbackHandler />
    </Suspense>
  );
}

function CallbackHandler() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // React runs effects twice in development; the code is single-use, so the
  // second attempt would fail against a code the first one already redeemed.
  const redeemed = useRef(false);

  useEffect(() => {
    if (redeemed.current) return;
    redeemed.current = true;

    const code = params.get('code');
    if (!code) {
      setError('That sign-in link was incomplete. Try again.');
      return;
    }

    void (async () => {
      try {
        const session = await api.post<AuthSession>('/auth/oauth/exchange', { code });

        tokenStore.set(session);
        queryClient.setQueryData(sessionKeys.me, session.user);
        router.replace('/rooms');
      } catch (caught) {
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Could not complete sign-in. Try again.',
        );
      }
    })();
  }, [params, queryClient, router]);

  if (error) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <p className="eyebrow">Sign-in failed</p>
          <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-tight text-bone">
            Something went wrong
          </h2>
        </div>
        <p role="alert" className="border border-axis-x/40 bg-axis-x/10 px-3 py-2 text-sm text-axis-x">
          {error}
        </p>
        <Button onClick={() => router.replace('/login')}>Back to sign in</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-12" aria-live="polite">
      <div className="viewport-grid h-20 w-full animate-pulse" aria-hidden="true" />
      <p className="eyebrow">Completing sign-in</p>
    </div>
  );
}
