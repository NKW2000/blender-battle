'use client';

import { OAuthProvider } from '@bb/shared';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  [OAuthProvider.DISCORD]: 'Continue with Discord',
  [OAuthProvider.GOOGLE]: 'Continue with Google',
};

/**
 * Provider buttons, rendered only for providers this deployment has credentials
 * for — a "Continue with Discord" button that 501s because nobody registered the
 * application is worse than no button at all.
 *
 * These are full-page navigations, not fetches: the OAuth flow is a browser
 * redirect chain by design, and an XHR cannot follow it to a third-party origin.
 */
export function OAuthButtons() {
  const { data } = useQuery({
    queryKey: ['auth', 'oauth-providers'],
    queryFn: () => api.get<{ providers: OAuthProvider[] }>('/auth/oauth/providers'),
    staleTime: 60 * 60 * 1000,
  });

  const providers = data?.providers ?? [];
  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-edge" aria-hidden="true" />
        <span className="eyebrow">or</span>
        <span className="h-px flex-1 bg-edge" aria-hidden="true" />
      </div>

      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => {
            window.location.href = `${API_URL}/auth/oauth/${provider}`;
          }}
        >
          {PROVIDER_LABEL[provider]}
        </Button>
      ))}
    </div>
  );
}
