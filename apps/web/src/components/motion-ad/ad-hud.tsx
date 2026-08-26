'use client';

import { useRef } from 'react';

import { BEATS, RUNTIME, clamp, easeOut, span } from './timeline';
import { useAdFrame } from './use-ad-clock';

/**
 * The frame around the film: corner brackets, a grid, a status line and a
 * running clock.
 *
 * This is what turns a sequence of product screens into a match. The scenes
 * underneath show what the product does; the HUD says that it is happening
 * live, under a timer, with a round number — and it stays on screen throughout
 * so the viewer never leaves the arena between beats.
 *
 * Everything here is one element deep and moves only with `transform` and
 * `opacity`, because it is composited over every other layer for the whole
 * fifty-five seconds and must cost nothing.
 */

/** What the status line reads during each beat. */
const STATUS: Record<string, string> = {
  boot: 'MATCH FOUND',
  challenge: 'BRIEF ISSUED',
  versus: 'ROUND 01 — LIVE',
  timer: 'BUILD PHASE',
  submit: 'SUBMISSION LOCKED',
  reveal: 'ENTRIES SEALED',
  voting: 'VOTING OPEN',
  victory: 'RESULT FINAL',
  montage: 'ARENA',
  cta: 'READY',
};

export function AdHud() {
  const clockRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    // Elapsed, as a match clock.
    const seconds = Math.floor(t);
    const clock = clockRef.current;
    if (clock) {
      clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }

    const beat = BEATS.find((b) => t >= b.from && t < b.to) ?? BEATS[BEATS.length - 1]!;
    const status = statusRef.current;
    if (status && status.dataset.beat !== beat.id) {
      status.dataset.beat = beat.id;
      status.textContent = STATUS[beat.id] ?? '';
    }

    /*
      The status snaps rather than fades.

      A HUD label that dissolves reads as a web page; one that cuts and flickers
      for a frame reads as a readout being updated by a system. The flicker is
      driven by how long ago the beat changed, so it happens once per change.
    */
    if (status) {
      const since = t - beat.from;
      const flick = since < 0.24 ? (Math.floor(since * 40) % 2 === 0 ? 0.35 : 1) : 1;
      status.style.opacity = String(flick);
    }

    if (barRef.current) barRef.current.style.transform = `scaleX(${clamp(t / RUNTIME)})`;

    /*
      The brackets breathe in at the start and hold.

      They also pull in slightly during the two loudest beats, which reads as
      the frame reacting to the moment rather than sitting on top of it.
    */
    const settle = easeOut(span(t, 0.35, 1.5));
    const tighten = span(t, 27.9, 28.15) * (1 - span(t, 28.4, 29)) * 0.6 + span(t, 41, 41.4) * (1 - span(t, 42, 42.6)) * 0.5;
    if (frameRef.current) {
      frameRef.current.style.opacity = String(settle * 0.9);
      frameRef.current.style.transform = `scale(${1 + (1 - settle) * 0.04 - tighten * 0.012})`;
    }

    // A slow scan down the frame, so the overlay is never completely static.
    if (scanRef.current) {
      scanRef.current.style.transform = `translate3d(0, ${((t * 14) % 130) - 15}vh, 0)`;
    }
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none" aria-hidden="true">
      {/* The measuring grid, very faint. */}
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,246,233,.14) 1px, transparent 1px),' +
            'linear-gradient(to bottom, rgba(255,246,233,.14) 1px, transparent 1px)',
          backgroundSize: '8vmin 8vmin',
          maskImage: 'radial-gradient(closest-side, rgba(0,0,0,.85), transparent 78%)',
        }}
      />

      {/* A single soft scan travelling down. */}
      <div
        ref={scanRef}
        className="absolute inset-x-0 h-[22vh] opacity-[0.05]"
        style={{
          background: 'linear-gradient(to bottom, transparent, var(--color-cream), transparent)',
          willChange: 'transform',
        }}
      />

      {/* Corner brackets. */}
      <div ref={frameRef} className="absolute inset-[2.6vmin]" style={{ willChange: 'transform, opacity' }}>
        {(
          [
            'left-0 top-0 border-l-2 border-t-2 rounded-tl-[1.2vmin]',
            'right-0 top-0 border-r-2 border-t-2 rounded-tr-[1.2vmin]',
            'left-0 bottom-0 border-l-2 border-b-2 rounded-bl-[1.2vmin]',
            'right-0 bottom-0 border-r-2 border-b-2 rounded-br-[1.2vmin]',
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            className={`absolute h-[4.4vmin] w-[4.4vmin] border-sun/70 ${corner}`}
          />
        ))}
      </div>

      {/* Top-left: the system label and the live state. */}
      <div className="absolute left-[5vmin] top-[4.6vmin] flex items-center gap-[1.4vmin] font-mono text-[1.35vmin] tracking-[0.28em] text-cream/70">
        <span className="inline-block h-[1.1vmin] w-[1.1vmin] rounded-full bg-mint shadow-[0_0_1.2vmin_var(--color-mint)]" />
        <span>BLENDERBATTLE</span>
        <span className="text-cream/30">/</span>
        <span ref={statusRef} className="text-sun" style={{ willChange: 'opacity' }}>
          MATCH FOUND
        </span>
      </div>

      {/* Top-right: the match clock. */}
      <div className="absolute right-[5vmin] top-[4.6vmin] font-mono text-[1.35vmin] tracking-[0.28em] text-cream/70">
        <span className="text-cream/40">ELAPSED </span>
        <span ref={clockRef} className="text-cream">00:00</span>
      </div>

      {/* Bottom-left: fixed technical furniture, the kind a readout always has. */}
      <div className="absolute bottom-[4.6vmin] left-[5vmin] font-mono text-[1.2vmin] tracking-[0.24em] text-cream/35">
        RENDER · 60FPS · ARENA_01
      </div>

      {/* The film's own progress. */}
      <div className="absolute inset-x-0 bottom-0 h-[0.45vmin] bg-cream/10">
        <div
          ref={barRef}
          className="h-full origin-left bg-linear-to-r from-sun to-flame"
          style={{ willChange: 'transform' }}
        />
      </div>
    </div>
  );
}
