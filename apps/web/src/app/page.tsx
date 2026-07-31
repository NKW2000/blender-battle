'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { ArcadeLanding } from '@/components/arcade/landing';
import { useSession } from '@/features/auth/use-session';

/**
 * The public front door.
 *
 * Signed-in players are sent straight to the arena — showing a returning
 * player a marketing pitch for a product they already use is a wasted screen.
 * Everyone else gets the landing page.
 */
export default function RootPage() {
  const { user, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) router.replace('/rooms');
  }, [user, isLoading, router]);

  if (user) return null;

  return <ArcadeLanding />;
}
