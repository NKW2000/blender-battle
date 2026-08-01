'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ChunkyButton } from '@/components/arcade/chunky';
import { cn } from '@/lib/utils';

export interface NavLink {
  href: string;
  label: string;
}

/**
 * Navigation for narrow screens.
 *
 * The header used to keep every destination in one strip that scrolled
 * sideways. That worked at any width in the sense that nothing overlapped, but
 * on a phone it put half the links off-screen with no sign they were there, and
 * the targets were about 32px tall against the 44px a thumb actually wants.
 *
 * A drawer holds any number of destinations at a comfortable size, which
 * matters here because the list is not fixed: an author sees Manage, an admin
 * also sees Admin, so a bottom tab bar would have had to hide items anyway.
 */
export function MobileNav({
  links,
  pathname,
  onSignOut,
  signingOut,
}: {
  links: NavLink[];
  pathname: string;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The portal target only exists in the browser, so the overlay is withheld
  // until after hydration rather than rendered into nothing on the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Navigating closes the drawer. Without this it stays open over the page it
  // just moved to, because a client-side route change unmounts nothing here.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (!focusable?.length) return;

      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        // h-11 w-11 is the 44px minimum a thumb needs; the icon inside is
        // smaller than the target on purpose.
        className="arcade-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-white/20 bg-white/6 text-bone transition-colors hover:bg-white/16 md:hidden"
      >
        <MenuGlyph />
      </button>

      {/*
        Portalled to <body>. The header that renders this sets backdrop-filter,
        and a filtered ancestor becomes the containing block for its fixed-
        position descendants — so `inset-0` resolved against the 56px header
        instead of the viewport, and the drawer was clipped to a strip.
      */}
      {open && mounted
        ? createPortal(
        <div
          className="fixed inset-0 z-[60] md:hidden"
          style={{ background: 'rgba(14,11,43,.72)', backdropFilter: 'blur(3px)' }}
          onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            /*
              Deliberately not animated. A slide-in has to start off-screen, and
              a keyframe that never advances — a backgrounded tab, a compositor
              that has stopped, reduced-motion handling that only neutralises
              part of it — leaves the drawer parked outside the viewport with no
              way to reach the navigation. The panel is placed by layout alone,
              so it is correct the instant it mounts and cannot be stranded.
            */
            className="ml-auto flex h-full w-[min(20rem,85vw)] flex-col border-l-4 border-edge bg-panel-raised"
          >
            <div className="flex items-center justify-between border-b-[3px] border-white/10 px-4 py-3">
              <span className="eyebrow text-aqua">Menu</span>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="arcade-focus flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white/20 bg-white/6 font-display text-lg font-bold text-bone-muted transition-colors hover:bg-white/16 hover:text-cream"
              >
                ✕
              </button>
            </div>

            {/* Scrolls independently, so a long list never pushes Sign out off. */}
            <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
              <ul className="flex flex-col gap-1.5">
                {links.map((link) => {
                  const isCurrent = pathname === link.href;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        prefetch
                        aria-current={isCurrent ? 'page' : undefined}
                        className={cn(
                          'arcade-focus flex min-h-12 items-center rounded-xl px-4 font-display text-sm font-bold uppercase tracking-wider transition-colors',
                          isCurrent
                            ? 'border-2 border-edge bg-sun text-edge'
                            : 'text-bone-muted hover:bg-white/8 hover:text-bone',
                        )}
                        style={
                          isCurrent ? { boxShadow: '0 3px 0 var(--color-edge)' } : undefined
                        }
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* padding-bottom clears the iOS home indicator, which otherwise
                sits over the last control. */}
            <div
              className="border-t-[3px] border-white/10 p-3"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
              <ChunkyButton
                tone="ghost"
                size="md"
                className="w-full"
                onClick={onSignOut}
                disabled={signingOut}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </ChunkyButton>
            </div>
          </div>
        </div>,
        document.body,
          )
        : null}
    </>
  );
}

function MenuGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
