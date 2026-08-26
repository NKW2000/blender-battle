'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { BEATS, RUNTIME, type SceneId } from './timeline';

/**
 * One clock, one animation frame, no re-renders.
 *
 * A fifty-five second film with ten scenes cannot be animated by React state.
 * Sixty renders a second across that many components spends the entire frame
 * budget in reconciliation and drops frames on exactly the beats that need to
 * land — so React draws the DOM once, and everything that moves is written
 * straight to a ref inside a single `requestAnimationFrame` loop.
 *
 * That also keeps the scenes pure functions of time, which is what makes the
 * film scrubbable: any timestamp can be rendered without having played the ones
 * before it, so the timeline can be dragged and lands exactly where it should.
 */

type FrameFn = (t: number) => void;

interface AdClock {
  subscribe: (fn: FrameFn) => () => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  restart: () => void;
  /** Read the clock without subscribing to renders. */
  now: () => number;
  playing: boolean;
  started: boolean;
  finished: boolean;
  reducedMotion: boolean;
}

const Ctx = createContext<AdClock | null>(null);

export function useAdClock() {
  const clock = useContext(Ctx);
  if (!clock) throw new Error('useAdClock must be used inside <AdClockProvider>');
  return clock;
}

/**
 * Registers a per-frame callback.
 *
 * The callback receives the film's current time and should write to refs.
 * Anything it returns is ignored, and it must not call React setters — that
 * would reintroduce the sixty-renders-a-second problem this exists to avoid.
 */
export function useAdFrame(fn: FrameFn) {
  const { subscribe } = useAdClock();

  // Held in a ref so a scene can close over fresh values without resubscribing
  // every render.
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(() => subscribe((t) => latest.current(t)), [subscribe]);
}

/** Which beat covers a timestamp. */
export function beatAt(t: number): SceneId {
  for (const beat of BEATS) if (t >= beat.from && t < beat.to) return beat.id;
  return BEATS[BEATS.length - 1]!.id;
}

export function AdClockProvider({ children }: { children: React.ReactNode }) {
  const subscribers = useRef(new Set<FrameFn>());
  const time = useRef(0);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);

    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const emit = useCallback((t: number) => {
    for (const fn of subscribers.current) fn(t);
  }, []);

  const subscribe = useCallback(
    (fn: FrameFn) => {
      subscribers.current.add(fn);
      // Draw the newcomer at the current time rather than leaving it at
      // whatever its markup says until the next frame.
      fn(time.current);
      return () => {
        subscribers.current.delete(fn);
      };
    },
    [],
  );

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    last.current = null;
  }, []);

  const tick = useCallback(
    (stamp: number) => {
      if (last.current === null) last.current = stamp;

      /*
        Elapsed time, clamped.

        A tab that was backgrounded returns one enormous delta, which would
        teleport the film forward — and a frame that took 400ms is better
        played as a slow frame than as a jump cut nobody asked for.
      */
      const delta = Math.min((stamp - last.current) / 1000, 1 / 20);
      last.current = stamp;

      time.current = Math.min(time.current + delta, RUNTIME);
      emit(time.current);

      if (time.current >= RUNTIME) {
        stop();
        setPlaying(false);
        setFinished(true);
        return;
      }

      raf.current = requestAnimationFrame(tick);
    },
    [emit, stop],
  );

  const play = useCallback(() => {
    if (raf.current !== null) return;
    if (time.current >= RUNTIME) time.current = 0;

    setStarted(true);
    setFinished(false);
    setPlaying(true);
    last.current = null;
    raf.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    stop();
    setPlaying(false);
  }, [stop]);

  const seek = useCallback(
    (t: number) => {
      time.current = Math.min(Math.max(t, 0), RUNTIME);
      setFinished(time.current >= RUNTIME);
      emit(time.current);
    },
    [emit],
  );

  const restart = useCallback(() => {
    time.current = 0;
    emit(0);
    setFinished(false);
    play();
  }, [emit, play]);

  const toggle = useCallback(() => {
    if (raf.current !== null) pause();
    else play();
  }, [pause, play]);

  /*
    A hidden tab is paused rather than left running.

    `requestAnimationFrame` already stops in a background tab, but the film
    would then resume mid-sentence when the tab comes back with the audio
    somewhere else entirely. Pausing makes the return deliberate.
  */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && raf.current !== null) pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pause]);

  useEffect(() => stop, [stop]);

  const value = useMemo<AdClock>(
    () => ({
      subscribe,
      play,
      pause,
      toggle,
      seek,
      restart,
      now: () => time.current,
      playing,
      started,
      finished,
      reducedMotion,
    }),
    [subscribe, play, pause, toggle, seek, restart, playing, started, finished, reducedMotion],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
