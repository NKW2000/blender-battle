'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  LOADING_DOTS_BACKDROP,
  LOADING_PANEL_BACKGROUND,
  LoadingMark,
} from '@/components/ui/loading-mark';

/*
  'arm' exists for one frame only.

  A transition needs a painted start value to travel from, and on the first
  navigation of a page's life the bars have never been painted — they sit in a
  hidden overlay. Flipping straight to the end position made them appear at
  their destination instead of sweeping in, which is the whole gesture. 'arm'
  paints them parked and visible; the frame after, they are told to move.
*/
type Phase = 'arm' | 'in' | 'hold' | 'out' | null;

/** The design's beats, in milliseconds from the moment the cover starts. */
const COVER_AT = 640;
const UNCOVER_AT = 1780;
const CLEAR_AT = 2500;

/*
  How long a navigation is given to finish before anything is drawn at all.

  A page that is already in the router's cache swaps in almost immediately, and
  covering it up afterwards showed the destination, then the cover, then the
  destination again — the same page twice with an animation in between. Nothing
  is worth watching for a navigation that has already happened, so a route that
  lands inside this window is simply left alone.
*/
const GRACE = 220;

/*
  A navigation that never lands must not leave the screen covered.

  The design drives this from its own `setState`, so the screen it is covering
  for has by definition already changed. A real router can be slow, or the click
  can turn out not to navigate at all — an anchor handled elsewhere, a route
  that redirects back to where it started. Without a cap the app is bricked
  behind a yellow panel.
*/
const SAFETY_UNCOVER_AT = 6000;

/**
 * The cover that plays over a navigation.
 *
 * Three bars sweep in on a tilt, a panel fades up behind them carrying the
 * mark, the route changes underneath, and the bars sweep out the other side.
 * It replaces the thin progress bar that used to creep across the top: a hairline
 * acknowledged the click, but the arcade language this product is built in does
 * not do hairlines.
 *
 * Timings are the design's: 640ms to cover, the bars staggered 70ms apart on a
 * 620ms travel, and the uncover beginning at 1780ms.
 */
export function RouteTransition() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Which path the click left from, so arriving can be told from a re-render.
  const leftFrom = useRef<string | null>(null);
  /*
    Uncovering needs two things to have happened, in either order: the route has
    landed, and the design's beat for it has come round. They are tracked
    separately because whichever happens second is the one that starts the exit.

    An earlier version cancelled the pending timers when the route landed, which
    on any fast navigation killed the cover before it had drawn — the bars swept
    in and straight back out and the mark never appeared at all.
  */
  const arrived = useRef(false);
  const beatPassed = useRef(false);
  // Whether anything has been drawn yet, so an early arrival knows whether it
  // has an animation to cut short or simply nothing to do.
  const covering = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const after = useCallback((ms: number, run: () => void) => {
    timers.current.push(setTimeout(run, ms));
  }, []);

  /** Sweeps the bars off and puts the overlay away. */
  const uncover = useCallback(() => {
    // Safe to clear here: both the cover and the beat have already fired by the
    // time anything can call this, so the only timer left is the safety net.
    clearTimers();
    setPhase('out');
    after(CLEAR_AT - UNCOVER_AT, () => {
      leftFrom.current = null;
      setPhase(null);
    });
  }, [after, clearTimers]);

  /*
    Any click that lands on an internal link starts the cover.

    Listening at the document rather than wrapping every `Link` keeps this to a
    single listener and covers links rendered anywhere in the tree, including
    ones inside components that know nothing about this.
  */
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      // Under a reduced-motion preference this does not play at all. The global
      // stylesheet collapses every duration to nothing, which would turn a
      // two-and-a-half second cover into a full-screen flash — worse than the
      // motion it is meant to spare someone.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      // Internal, and not a jump within the page you are already on.
      if (!href.startsWith('/') || href.split(/[?#]/)[0] === pathname) return;

      clearTimers();
      leftFrom.current = pathname;
      arrived.current = false;
      beatPassed.current = false;
      covering.current = false;

      // Nothing is drawn during the grace window. If the route lands inside it,
      // the click is over before this ever becomes visible.
      after(GRACE, () => {
        covering.current = true;

        setPhase('arm');
        // Two frames: the first commits 'arm', the second is the earliest the
        // browser can have painted it.
        requestAnimationFrame(() => requestAnimationFrame(() => setPhase('in')));

        after(COVER_AT, () => setPhase('hold'));

        after(UNCOVER_AT, () => {
          beatPassed.current = true;
          if (arrived.current) uncover();
        });

        after(SAFETY_UNCOVER_AT, () => {
          arrived.current = true;
          beatPassed.current = true;
          uncover();
        });
      });
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [pathname, after, clearTimers, uncover]);

  /*
    Arrival uncovers.

    Keyed on the path actually changing rather than on a timer, so a slow route
    stays covered until it is ready instead of revealing a half-built page. When
    it is quick — which is most of the time — `uncover` still waits for the
    design's beat, so the rhythm is the same either way.
  */
  useEffect(() => {
    if (leftFrom.current === null || pathname === leftFrom.current) return;

    arrived.current = true;

    // Landed inside the grace window: nothing was ever drawn, so there is
    // nothing to play out. The page simply appears, which is the whole point.
    if (!covering.current) {
      clearTimers();
      leftFrom.current = null;
      return;
    }

    /*
      Landed while the bars were still sweeping.

      The panel is what hides the page underneath, and it does not normally come
      up until 640ms. A route committing before then would put the destination
      on screen behind a half-drawn cover — visible, then hidden, then revealed
      again. Going straight to `hold` snaps the panel opaque on the same frame
      the new page commits, so it is never seen early. The bars carry on
      sweeping across it.
    */
    setPhase((current) => (current === 'arm' || current === 'in' ? 'hold' : current));

    // Only if the beat has already come round; otherwise the timer above picks
    // it up, so a quick route still gets the full cover rather than a flash.
    if (beatPassed.current) uncover();
  }, [pathname, uncover, clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  const covered = phase === 'hold';
  // Parked off to the left until they are called in, and driven off to the right
  // on the way out.
  const x = covered || phase === 'in' ? 0 : phase === 'out' ? 152 : -152;
  // Armed is visible but has not been told to move yet, so it must not animate
  // into its parked position either.
  const barTravel = phase === 'arm' ? '0s' : '.62s';

  return (
    <div
      aria-hidden={phase === null}
      role={phase === null ? undefined : 'status'}
      className="fixed inset-0 z-[200] overflow-hidden"
      style={{
        pointerEvents: phase ? 'auto' : 'none',
        visibility: phase ? 'visible' : 'hidden',
      }}
    >
      {/* Oversized and tilted, so the bars run off every edge at an angle. */}
      <div className="absolute left-[-32%] top-[-34%] h-[168%] w-[164%] rotate-[-22deg]">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="absolute left-[-6%] w-[112%] rounded-full"
            style={{
              height: '42%',
              top: `${-2 + index * 31}%`,
              background: 'var(--color-sun)',
              boxShadow: '0 16px 0 var(--color-arcade-lift)',
              transform: `translateX(${x}%)`,
              /*
                Longhand, not the `transition` shorthand.

                React warns when a shorthand and one of its longhands are both
                set and updated on the same element — the two can be applied in
                either order across a re-render, so the delay is liable to be
                wiped by the shorthand it was meant to complement.
              */
              transitionProperty: 'transform',
              transitionDuration: barTravel,
              transitionTimingFunction: 'cubic-bezier(.76,0,.24,1)',
              // Leaving, they go in the order they arrived in reverse, so the
              // screen wipes clear the way it was drawn.
              transitionDelay: `${(phase === 'out' ? 2 - index : index) * 70}ms`,
            }}
          />
        ))}
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          background: LOADING_PANEL_BACKGROUND,
          opacity: covered ? 1 : 0,
          transitionProperty: 'opacity',
          transitionDuration: covered ? '.18s' : '.22s',
          transitionTimingFunction: 'ease',
          transitionDelay: covered ? '.02s' : '0s',
        }}
      >
        <div className="pointer-events-none absolute inset-0" style={LOADING_DOTS_BACKDROP} />
        {/* Mounted only while covered, so the mark's spin plays on every
            navigation rather than once for the life of the page. */}
        {covered ? <LoadingMark /> : null}
      </div>
    </div>
  );
}
