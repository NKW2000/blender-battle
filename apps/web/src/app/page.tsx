'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ArcadeLanding } from '@/components/arcade/landing';
import { RouteLoader } from '@/components/ui/route-loader';
import { probablySignedIn, useSession } from '@/features/auth/use-session';

/**
 * The public front door.
 *
 * Signed-in players are sent straight to the arena — showing a returning
 * player a marketing pitch for a product they already use is a wasted screen.
 * Everyone else gets the landing page.
 *
 * Whether there is a session is a question only the server can answer, and on a
 * cold load the answer takes a second or two to arrive. This used to paint the
 * landing page in the meantime, so a returning player read half of it and was
 * then yanked to `/rooms` — which looks like the app signing them in by itself.
 *
 * So the wait is spent on whichever screen is more likely to be the right one.
 * A browser that had a session last time waits on the loader it would have seen
 * a moment later anyway; one that did not gets the landing page immediately,
 * because making a first-time visitor stare at a spinner to spare a returning
 * player a redirect is the wrong trade.
 */
export default function RootPage() {
  const { user, isLoading } = useSession();
  const router = useRouter();

  /*
    Read once, on the client, after mount.

    The server has no localStorage, so reading it during render would make the
    first client render disagree with the server's HTML and React would throw
    the whole tree away. Starting false means the server and the first client
    render both say "landing page", and the correction happens in an effect.
  */
  const [expectSession, setExpectSession] = useState(false);
  useEffect(() => setExpectSession(probablySignedIn()), []);

  useEffect(() => {
    if (!isLoading && user) router.replace('/rooms');
  }, [user, isLoading, router]);

  // Signed in: the redirect above is already on its way, so paint nothing that
  // will have to be taken back.
  if (user) return <RouteLoader />;

  if (isLoading && expectSession) return <RouteLoader />;

  return <ArcadeLanding />;
}
