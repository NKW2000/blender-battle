'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { RouteTransition } from '@/components/ui/route-transition';
import { Toaster } from '@/components/ui/toaster';
import { ApiError } from '@/lib/api/client';
import { notify } from '@/lib/notify';

export function Providers({ children }: { children: React.ReactNode }) {
  // Created inside state so each browser session gets its own client and no cache
  // is ever shared between users during server rendering.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        /*
          Every failed write reports itself. Before this, a mutation only spoke
          up if its own hook remembered to add an `onError`, so whole areas —
          rooms, entries, voting — failed in silence and looked to the user like
          a button that simply did nothing.

          Two ways to opt out, both because the failure is already being said
          somewhere better: a hook with its own `onError` has the context to word
          it properly, and `meta.inlineError` marks a form that prints the
          message next to the control that failed — which beats a message in the
          far corner of the screen. Either way, firing here as well would show
          the same failure twice.
        */
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            if (mutation.options.onError || mutation.meta?.inlineError) return;
            notify.failure(error);
          },
        }),
        /*
          Reads are quieter on purpose. A query with no data yet is a screen
          rendering its own empty or error state, and a toast on top of that says
          the same thing twice. A query that already had data is the dangerous
          case: the refresh failed, the page still shows the old numbers, and
          nothing on screen would otherwise admit they are stale.
        */
        queryCache: new QueryCache({
          onError: (error, query) => {
            if (query.state.data === undefined) return;
            notify.failure(error);
          },
        }),
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
      <RouteTransition />
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
