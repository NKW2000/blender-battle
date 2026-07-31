'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';

import { RouteProgress } from '@/components/ui/route-progress';
import { ApiError } from '@/lib/api/client';

export function Providers({ children }: { children: React.ReactNode }) {
  // Created inside state so each browser session gets its own client and no cache
  // is ever shared between users during server rendering.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            /**
             * Keep cached pages in memory for 30 minutes after nothing is using
             * them (React Query's default is 5).
             *
             * This is what makes going back to a page you already visited
             * instant: the data is still there, so it renders immediately and
             * revalidates behind the scenes instead of showing a skeleton and
             * re-fetching from scratch.
             */
            gcTime: 30 * 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Auth and validation failures are deterministic — retrying them
              // only multiplies the load and delays the error the user needs.
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RouteProgress />
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-panel)',
            border: '1px solid var(--color-edge)',
            borderRadius: '0',
            color: 'var(--color-bone)',
          },
        }}
      />
    </QueryClientProvider>
  );
}
