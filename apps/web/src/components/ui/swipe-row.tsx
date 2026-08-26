'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * A row of things you can swipe, with arrows when there is somewhere to go.
 *
 * Two rules do most of the work here.
 *
 * The arrows appear only when the row actually overflows, measured rather than
 * assumed. That is what lets one component serve a strip of three thumbnails and
 * a strip of thirty without a breakpoint deciding which: at a width where
 * everything fits, there is nothing to scroll to and no controls to ignore.
 *
 * And the track is centred by `mx-auto` on a `w-fit` inner element rather than
 * by `justify-center` on the scroller. They look equivalent and are not — a flex
 * container that centres its overflowing content puts the start of that content
 * at a negative scroll offset, where no browser will let you reach it. The first
 * item simply becomes unreachable. An auto margin collapses to nothing once the
 * content is wider than the box, so a short row centres and a long one starts at
 * the left and scrolls all the way.
 */
export function SwipeRow({
  children,
  ariaLabel,
  className,
  trackClassName,
  itemSelector = ':scope > * > *',
}: {
  children: ReactNode;
  /** Names the group for a screen reader, e.g. "8 pinned works". */
  ariaLabel: string;
  /** On the scroller itself — where responsive layout switches belong. */
  className?: string;
  /** On the inner track. Use `sm:contents` to hand children to a grid above. */
  trackClassName?: string;
  /** How to find one item, for working out how far an arrow should scroll. */
  itemSelector?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;

    /*
      A pixel of slack at both ends.

      Fractional layout means `scrollLeft` lands on 0.4 rather than 0, and the
      sum at the far end is a fraction short of `scrollWidth`. Comparing exactly
      leaves the arrow you just used enabled and the one you need disabled.
    */
    const max = el.scrollWidth - el.clientWidth;
    setOverflowing(max > 1);
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    measure();
    el.addEventListener('scroll', measure, { passive: true });

    // Guarded: jsdom has no ResizeObserver, and a missing one must not take the
    // row with it — it only means the arrows stop reacting to a resize.
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);

    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [measure, children]);

  const step = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;

    /*
      One item, not one screenful.

      A page-sized jump on a strip of small thumbnails skips past the one someone
      was reaching for.

      The width is checked rather than trusted. An item that has not been laid
      out yet — images still loading, or a row rendered inside a collapsed
      container — measures zero, and scrolling by zero is a button that visibly
      does nothing. Most of the visible width is the fallback for both that and
      for a selector matching nothing.
    */
    const item = el.querySelector<HTMLElement>(itemSelector);
    const width = item?.getBoundingClientRect().width ?? 0;
    const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0;
    const distance = width > 1 ? width + gap : el.clientWidth * 0.8;

    el.scrollBy({ left: distance * direction, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={scrollerRef}
        role="group"
        aria-label={ariaLabel}
        // Focusable so a keyboard can scroll it: nothing inside is guaranteed to
        // be interactive, and an unreachable scroller is unreachable content.
        tabIndex={0}
        className={cn('overflow-x-auto', className)}
      >
        <div className={cn('mx-auto flex w-fit', trackClassName)}>{children}</div>
      </div>

      {overflowing ? (
        <div className="flex items-center justify-center gap-3">
          <Arrow label="Scroll left" disabled={atStart} onClick={() => step(-1)} direction="left" />
          <Arrow label="Scroll right" disabled={atEnd} onClick={() => step(1)} direction="right" />
        </div>
      ) : null}
    </div>
  );
}

function Arrow({
  label,
  disabled,
  onClick,
  direction,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  direction: 'left' | 'right';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="arcade-focus flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-ink bg-white/8 text-bone transition-colors hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-35"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
