'use client';

import { Role } from '@bb/shared';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { ArcadeLogo, ArcadeWordmark } from '@/components/arcade/chunky';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { SoundToggle } from '@/components/ui/sound-toggle';
import { Button } from '@/components/ui/button';
import { RouteLoader } from '@/components/ui/route-loader';
import { useLogout, useSession } from '@/features/auth/use-session';
import { useNotificationListener } from '@/features/notifications/use-notifications';

/**
 * Client-side guard.
 *
 * Not a security boundary — every protected endpoint is enforced server-side by
 * a guard, and this only decides what to render. With an in-memory access token
 * there is nothing for Next.js middleware to read on the server anyway, so the
 * check belongs here, where the session query actually lives.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useSession();
  const logout = useLogout();
  // One listener for the whole app, so a notification arriving on any page surfaces.
  useNotificationListener(Boolean(user));
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !user) {
    return <RouteLoader />;
  }

  const canAuthor = user.role === Role.MANAGER || user.role === Role.ADMIN;

  const navLinks = [
    // Arena is the lobby: queue, spectate and recent form in one place.
    { href: '/events', label: 'Challenges' },
    { href: '/rooms', label: 'Rooms' },
    { href: '/challenges', label: 'Catalogue' },
    { href: `/u/${user.username}`, label: 'Profile' },
    ...(canAuthor ? [{ href: '/manage/challenges', label: 'Manage' }] : []),
    ...(user.role === Role.ADMIN ? [{ href: '/admin', label: 'Admin' }] : []),
    { href: '/settings/profile', label: 'Settings' },
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b-4 border-edge bg-panel/95 backdrop-blur-sm">
        {/*
          Two rows on narrow screens, one from md up. The nav strip scrolls
          inside itself rather than widening the page — a horizontally scrolling
          body is never acceptable, and with this many destinations the single
          row overflows well before mobile widths.
        */}
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-2 md:h-14 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6 md:py-0">
          <div className="flex items-center justify-between">
            <Link href="/rooms" className="flex shrink-0 items-center gap-2.5">
              <ArcadeLogo size={32} />
              <ArcadeWordmark size={18} />
            </Link>

            <div className="flex items-center gap-2 md:hidden">
              <SoundToggle />
              <NotificationBell />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                Sign out
              </Button>
            </div>
          </div>

          <nav
            className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0"
            aria-label="Main"
          >
            {navLinks.map((link) => {
              const isCurrent = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  // Every nav target is one of a handful of routes the user will
                  // almost certainly visit, so the payload is fetched up front
                  // and the click resolves against cache instead of the network.
                  prefetch
                  onMouseEnter={() => router.prefetch(link.href)}
                  onFocus={() => router.prefetch(link.href)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`shrink-0 rounded-xl px-3 py-2 font-display text-xs font-bold uppercase tracking-wider transition-colors ${
                    isCurrent
                      ? 'border-2 border-edge bg-sun text-edge'
                      : 'text-bone-muted hover:text-bone'
                  }`}
                  style={isCurrent ? { boxShadow: '0 3px 0 var(--color-edge)' } : undefined}
                >
                  {link.label}
                </Link>
              );
            })}

            <div className="ml-2 hidden shrink-0 md:block">
              <SoundToggle />
            </div>
            <div className="hidden shrink-0 md:block">
              <NotificationBell />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-1 hidden shrink-0 md:inline-flex"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              Sign out
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
