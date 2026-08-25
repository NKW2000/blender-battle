'use client';

import { Role } from '@bb/shared';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { ArcadeLogo, ArcadeWordmark } from '@/components/arcade/chunky';
import { MobileNav } from '@/components/layout/mobile-nav';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { VerifyEmailBanner } from '@/components/auth/verify-email-banner';
import { Button } from '@/components/ui/button';
import { SoundToggle } from '@/components/ui/sound-toggle';
import { useLogout, useSession } from '@/features/auth/use-session';

/**
 * The header and page frame.
 *
 * Extracted from the authenticated layout so the public pages — a challenge
 * brief and a scheduled event, the two things people actually share links to —
 * can wear the same chrome without inheriting the sign-in redirect that sits
 * beside it. Those pages were previously unreachable to anyone signed out,
 * which for the only publicly shareable surface in the product is the wrong way
 * round.
 *
 * It therefore has to tolerate `user === null`: nav is trimmed to the public
 * destinations, and the sign-out control becomes a sign-in link.
 */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const logout = useLogout();
  const router = useRouter();
  const pathname = usePathname();

  const canAuthor = user?.role === Role.MANAGER || user?.role === Role.ADMIN;

  const navLinks = user
    ? [
        { href: '/events', label: 'Challenges' },
        { href: '/rooms', label: 'Rooms' },
        { href: '/leaderboard', label: 'Ranks' },
        { href: `/u/${user.username}`, label: 'Profile' },
        ...(canAuthor ? [{ href: '/manage/challenges', label: 'Manage' }] : []),
        ...(user.role === Role.ADMIN ? [{ href: '/admin', label: 'Admin' }] : []),
        { href: '/settings/profile', label: 'Settings' },
      ]
    : // Signed out: only the destinations that render without an account. A nav
      // full of links that bounce to /login is worse than a short one.
      [
        { href: '/events', label: 'Challenges' },
        { href: '/leaderboard', label: 'Ranks' },
      ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b-4 border-edge bg-panel/95 backdrop-blur-sm">
        {/*
          The drawer holds until the full row genuinely fits, which is `lg` and
          not `md`.

          Measured: an admin's row — brand, seven destinations, sound,
          notifications and sign-out — needs 1000px, and a player's 851px. It
          was appearing from 768px, so between there and about 1130 the nav had
          nowhere to go and drew straight over the wordmark, which is exactly
          what it looked like: "CHALLENGES" sitting on top of "BLENDERBATTLE".

          Nothing here shrinks — the links are `shrink-0` and a wordmark is an
          SVG at a fixed size — so an overflowing row cannot compress, it can
          only overlap. Switching where it fits is the fix; `min-w-0` on the nav
          is the seatbelt if a future destination pushes it over again.
        */}
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 md:px-6">
          {/*
            `min-w-0` rather than `shrink-0`. The brand was refusing to give up
            any width, so on a 360px phone the row measured 369px and pushed the
            menu button past the edge — the whole page then scrolled sideways,
            which is what made the site look zoomed in and off-centre. The
            controls are the ones that must never shrink; the brand can.
          */}
          <Link href={user ? '/rooms' : '/'} className="flex min-w-0 items-center gap-2.5">
            <ArcadeLogo size={32} />
            {/*
              The mark alone below 400px. Truncating a wordmark to
              "BLENDERBAT…" looks like a bug rather than a design, and the logo
              already identifies the site.
            */}
            <span className="hidden min-[400px]:block">
              <ArcadeWordmark size={18} />
            </span>
          </Link>

          {/* Below md the destinations live in the drawer, so the bar keeps only
              what has to stay reachable in one tap. */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:hidden">
            <SoundToggle />
            {user ? <NotificationBell /> : null}
            <MobileNav
              links={navLinks}
              pathname={pathname}
              onSignOut={user ? () => logout.mutate() : undefined}
              signingOut={logout.isPending}
            />
          </div>

          <nav className="hidden min-w-0 items-center gap-1 lg:flex" aria-label="Main">
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
                  className={`shrink-0 rounded-xl px-2.5 py-2 font-display text-xs font-bold uppercase tracking-wider transition-colors ${
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

            <div className="ml-2 shrink-0">
              <SoundToggle />
            </div>
            {user ? (
              <>
                <div className="shrink-0">
                  <NotificationBell />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-1 shrink-0"
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <Button asChild size="sm" className="ml-1 shrink-0">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <VerifyEmailBanner />
        {children}
      </main>
    </div>
  );
}
