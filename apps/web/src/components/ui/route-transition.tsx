'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  LOADING_DOTS_BACKDROP,
  LOADING_PANEL_BACKGROUND,
  LoadingMark,
} from '@/components/ui/loading-mark';
import { COVER_NAVIGATION_EVENT } from '@/lib/route-transition-signal';

/*
  'arm' exists for one frame only.

  A transition needs a painted start value to travel from, and on the first
  navigation of a page's life the bars have never been painted — they sit in a
  hidden overlay. Flipping straight to the end position made them appear at
  their destination instead of sweeping in, which is the whole gesture. 'arm'
  paints them parked and visible; the frame after, they are told to move.
*/
type Phase = 'arm' | 'in' | 'hold' | 'out' | null;

/**
 * How much of the transition a navigation earns.
 *
 * 'full' is the whole thing — bars, the panel, the mark and the word LOADING.
 * It is kept for the handful of moments that are actually events: signing in,
 * signing out, and stepping into a room that is about to start. 'lines' is the
 * bars alone, sweeping past, and ordinary browsing gets that.
 *
 * The distinction exists because the panel was playing on every click. A
 * ceremony that happens on the way to the leaderboard is not a ceremony, and it
 * made the site feel slow in exactly the places it should feel quick.
 */
type Mode = 'full' | 'lines';

/** The design's beats, in milliseconds from the moment the transition starts. */
const COVER_AT = 640;
/* The design uncovers at 1780 and clears at 2500; the gap is the exit sweep. */
const OUT_DURATION = 720;

/*
  The shortest the panel may stay up once it is opaque.

  The design holds for a flat 1140ms, which suits a state swap that has already
  happened. Here the hold is doing real work — waiting for a route — so it is a
  floor rather than a fixed length: as long as the navigation needs, and never
  less than one full turn of the mark. Cutting the spin off part-way is the one
  thing that would make the panel look broken rather than brief.
*/
const MARK_SPIN = 700;
const MIN_HOLD = MARK_SPIN + 60;

/*
  The bars alone do not wait for anything.

  There is nothing behind them to hide and nothing to read, so they sweep in and
  straight back out — the last is still arriving as the first leaves. Holding
  them would only be asking someone to look at a stripe.
*/
const LINES_TURN = 620;

/*
  A navigation that never lands must not leave the screen covered.

  The design drives this from its own `setState`, so the screen it is covering
  for has by definition already changed. A real router can be slow, or the click
  can turn out not to navigate at all. Without a cap the app is bricked behind a
  yellow panel.
*/
const SAFETY_UNCOVER_AT = 6000;

/** Stepping into a specific room — not the room list. */
const ROOM_PATH = /^\/rooms\/[^/]+$/;

/**
 * The transition that plays over a navigation.
 *
 * Three bars sweep in on a tilt. On the moments that warrant it a panel fades up
 * behind them carrying the mark, the route changes underneath, and the bars
 * sweep out the other side; the rest of the time the bars simply pass through.
 *
 * Timings are the design's: 640ms to cover, the bars staggered 70ms apart on a
 * 620ms travel, and a 720ms exit.
 */
export function RouteTransition() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>(null);
  const [mode, setMode] = useState<Mode>('lines');

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Which path the transition left from, so arriving can be told from a
  // re-render.
  const leftFrom = useRef<string | null>(null);
  const arrived = useRef(false);
  // Whether the panel has been up long enough to be allowed to leave.
  const holdDone = useRef(false);
  // Guards the hold against being entered twice — the timer and an early
  // arrival can both reach for it.
  const held = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const after = useCallback((ms: number, run: () => void) => {
    timers.current.push(setTimeout(run, ms));
  }, []);

  const finish = useCallback(() => {
    leftFrom.current = null;
    setPhase(null);
  }, []);

  /** Sweeps the bars off and puts the overlay away. */
  const uncover = useCallback(() => {
    clearTimers();
    setPhase('out');
    after(OUT_DURATION, finish);
  }, [after, clearTimers, finish]);

  /** Brings the panel up and starts the clock on how long it must stay. */
  const enterHold = useCallback(() => {
    if (held.current) return;
    held.current = true;

    setPhase('hold');
    after(MIN_HOLD, () => {
      holdDone.current = true;
      if (arrived.current) uncover();
    });
  }, [after, uncover]);

  const start = useCallback(
    (nextMode: Mode, from: string) => {
      clearTimers();
      leftFrom.current = from;
      arrived.current = false;
      holdDone.current = false;
      held.current = false;

      setMode(nextMode);
      setPhase('arm');
      // Two frames: the first commits 'arm', the second is the earliest the
      // browser can have painted it.
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase('in')));

      if (nextMode === 'lines') {
        after(LINES_TURN, () => {
          setPhase('out');
          after(OUT_DURATION, finish);
        });
        return;
      }

      after(COVER_AT, enterHold);
      after(SAFETY_UNCOVER_AT, () => {
        arrived.current = true;
        holdDone.current = true;
        uncover();
      });
    },
    [after, clearTimers, enterHold, finish, uncover],
  );

  /*
    Any click that lands on an internal link starts the transition.

    Listening at the document rather than wrapping every `Link` keeps this to a
    single listener and covers links rendered anywhere in the tree, including
    ones inside components that know nothing about this.
  */
  useEffect(() => {
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      // Under a reduced-motion preference this does not play at all. The global
      // stylesheet collapses every duration to nothing, which would turn the
      // sweep into a full-screen flash — worse than the motion it spares.
      if (reduced()) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const destination = href.split(/[?#]/)[0] ?? '';
      // Internal, and not a jump within the page you are already on.
      if (!href.startsWith('/') || destination === pathname) return;

      start(ROOM_PATH.test(destination) ? 'full' : 'lines', pathname);
    };

    // Signing in and signing out do not go through a link.
    const onRequest = () => {
      if (reduced()) return;
      start('full', pathname);
    };

    document.addEventListener('click', onClick, true);
    window.addEventListener(COVER_NAVIGATION_EVENT, onRequest);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(COVER_NAVIGATION_EVENT, onRequest);
    };
  }, [pathname, start]);

  /*
    Arrival uncovers, for the full cover only.

    Keyed on the path actually changing rather than on a timer, so a slow route
    stays covered until it is ready instead of revealing a half-built page. The
    bars alone have nothing to wait for and run to their own clock.
  */
  useEffect(() => {
    if (mode !== 'full') return;
    if (leftFrom.current === null || pathname === leftFrom.current) return;

    arrived.current = true;

    /*
      Landed while the bars were still sweeping.

      The panel is what hides the page underneath, and it does not normally come
      up until 640ms. A route committing before then would put the destination
      on screen behind a half-drawn cover — visible, then hidden, then revealed
      again. Going to the hold early snaps the panel opaque on the same frame
      the new page commits, so it is never seen twice.
    */
    enterHold();

    // Only once the panel has served its minimum; otherwise the timer started
    // by `enterHold` picks it up, so a quick route still gets a whole cover
    // rather than a flash of one.
    if (holdDone.current) uncover();
  }, [pathname, mode, uncover, enterHold]);

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

      {/* Only the momentous navigations get a panel to read. */}
      {mode === 'full' ? (
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
      ) : null}
    </div>
  );
}
