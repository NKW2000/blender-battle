import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The application surface, on the arcade language.
 *
 * This is the "block": a translucent face, a thick ink outline, and a hard
 * offset shadow with no blur, so every panel reads as a sticker sitting on the
 * page rather than a region drawn on it.
 *
 * It used to be a raised indigo gradient with a 4px outline and a 12px shadow,
 * which is where the application started. The brief screens were then built to
 * the handoff design and arrived at a lighter face, a 3px outline and an 8px
 * shadow — better, because a page holding six of these was six heavy slabs, and
 * the translucent face lets the page's own gradient through so the surfaces sit
 * *in* the scene. Rather than leave two panel languages in the codebase, the
 * design moves here, which carries it onto every screen at once.
 *
 * `active` keeps its meaning: the accent outline, for the one panel on a screen
 * that is currently live.
 */
export function Panel({
  className,
  active,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { active?: boolean }) {
  return (
    <div
      data-active={active ? 'true' : undefined}
      className={cn(
        /*
          No `overflow-hidden` here, deliberately.

          The head is rounded to match the panel instead. Clipping at the panel
          would be the obvious way to get that curve, and it silently truncates
          anything a child positions outside the box — the custom `Select`
          listbox and the datetime calendar are absolutely positioned, not
          portalled, so a dropdown inside a panel would open and be cut off at
          the panel's edge.
        */
        'flex flex-col rounded-[22px] border-[3px] border-ink bg-white/4',
        active && 'border-sun',
        className,
      )}
      style={{ boxShadow: '0 8px 0 var(--color-ink)' }}
      {...props}
    >
      {children}
    </div>
  );
}

export type PanelTone = 'sun' | 'aqua' | 'mint' | 'punch' | 'ember';

/**
 * The icon tile at the head of a panel.
 *
 * Small, filled with an accent, ink-outlined and shadowed like everything else.
 * It is what stops a column of panels reading as an undifferentiated stack —
 * the colour is the thing you actually navigate by once a screen has four of
 * them.
 */
export function PanelIcon({ tone, children }: { tone: PanelTone; children: React.ReactNode }) {
  const fill = {
    sun: 'bg-sun',
    aqua: 'bg-aqua',
    mint: 'bg-mint',
    punch: 'bg-punch',
    ember: 'bg-ember',
  }[tone];

  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[2.5px] border-ink text-ink ${fill}`}
      style={{ boxShadow: '0 3px 0 var(--color-ink)' }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/** The line icons the panel heads use. Geometric, 2.2–2.4 stroke, round joins. */
export const PANEL_ICON = {
  upload: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M8 8l4-4 4 4" />
      <path d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9" r="1.6" />
      <path d="M21 16l-5-5-6 6" />
    </svg>
  ),
  lines: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16M4 12h16M4 19h10" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7L9 18l-5-5" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M12 2h4M12 2H8" />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3 20a6 6 0 0112 0M16.5 5.5a3.4 3.4 0 010 5M18 20a6 6 0 00-2-4.5" />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v5a5 5 0 01-10 0z" />
      <path d="M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M12 14v3M9 20h6" />
    </svg>
  ),
} as const;

/**
 * The panel head.
 *
 * `icon` is optional so the change did not have to touch every existing call at
 * once, but a panel that carries one reads better in a stack and it is the
 * default the design intends. Anything after the title is pushed to the right,
 * which is how the several panels with a count or a control in the head already
 * behaved.
 */
export function PanelHeader({
  className,
  icon,
  tone = 'sun',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { icon?: React.ReactNode; tone?: PanelTone }) {
  return (
    <div
      className={cn(
        // 19px, not 22: the panel's radius less its 3px border, so the head's
        // fill follows the outline exactly rather than cutting the corner.
        'flex shrink-0 items-center gap-3 rounded-t-[19px] border-b-[3px] border-ink bg-white/3 px-5 py-4 sm:px-6.5 sm:py-5',
        // Without an icon the title still has to hold the left edge and the
        // trailing control the right, which is what `justify-between` did.
        !icon && 'justify-between',
        className,
      )}
      {...props}
    >
      {icon ? <PanelIcon tone={tone}>{icon}</PanelIcon> : null}
      {children}
    </div>
  );
}

/**
 * The panel's heading.
 *
 * `ml-auto` on whatever follows is what keeps a trailing badge or button at the
 * right edge once an icon has taken the left, so the head lays out the same way
 * with or without one.
 */
export function PanelTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('font-display text-xl font-bold text-cream [&+*]:ml-auto', className)}
      {...props}
    />
  );
}

export function PanelBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-5 sm:px-6.5 sm:py-6', className)} {...props} />;
}

/**
 * A tile inside a panel: the small ink-outlined block the briefs use for stats
 * and the schedule uses for its dates.
 *
 * Exported because the pattern kept being rewritten inline with slightly
 * different borders and shadows every time, which is the drift this whole change
 * exists to stop.
 */
export function PanelTile({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[14px] border-[2.5px] border-ink bg-white/5 px-4 py-3.5', className)}
      style={{ boxShadow: '0 4px 0 var(--color-ink)' }}
      {...props}
    />
  );
}

/** Loading placeholder. Rounded to match the surfaces it stands in for. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-2xl bg-white/8', className)}
      {...props}
    />
  );
}

/** Empty states carry the action, so the screen is an invitation rather than a dead end. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div
        aria-hidden="true"
        className="h-3 w-12 rounded-full border-2 border-ink bg-sun"
        style={{ boxShadow: '0 3px 0 var(--color-ink)' }}
      />
      <p className="mt-1 font-display text-xl font-bold text-cream">{title}</p>
      <p className="max-w-sm font-bold text-haze">{description}</p>
      {action}
    </div>
  );
}
