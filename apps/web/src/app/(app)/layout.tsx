'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { AppChrome } from '@/components/layout/app-chrome';
import { RouteLoader } from '@/components/ui/route-loader';
import { useSession } from '@/features/auth/use-session';
import { useNotificationListener } from '@/features/notifications/use-notifications';

/**
 * Client-side guard.
 *
 * Not a security boundary — every protected endpoint is enforced server-side by
 * a guard, and this only decides what to render. With an in-memory access token
 * there is nothing for Next.js middleware to read on the server anyway, so the
 * check belongs here, where the session query actually lives.
 *
 * The chrome itself moved to `AppChrome`, because the public pages need the
 * same header without this redirect.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useSession();
  // One listener for the whole app, so a notification arriving on any page surfaces.
  useNotificationListener(Boolean(user));
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !user) {
    return <RouteLoader />;
  }

  return <AppChrome>{children}</AppChrome>;
}
