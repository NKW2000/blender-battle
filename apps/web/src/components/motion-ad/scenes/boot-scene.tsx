'use client';

import { useRef } from 'react';

import { AdScene } from '../ad-scene';
import { HudFrame, HudLabel } from '../ad-parts';
import { clamp, easeOut, impact, mix, span, spring } from '../timeline';
import { useAdFrame } from '../use-ad-clock';

/**
 * 0–4s — the system wakes up and finds a match.
 *
 * The film opens on almost nothing: a caret blinking in the dark. That restraint
 * is doing a job — everything after this is loud, and four seconds of quiet at
 * the top is what gives the first impact somewhere to land from.
 */
export function BootScene() {
  const caretRef = useRef<HTMLSpanElement>(null);
  const matchRef = useRef<HTMLDivElement>(null);
  const p1Ref = useRef<HTMLDivElement>(null);
  const p2Ref = useRef<HTMLDivElement>(null);
  const vsRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    // A caret that blinks on a real cadence, then stops when the line lands.
    if (caretRef.current) {
      const alive = t < 1.5;
      caretRef.current.style.opacity = alive ? (Math.floor(t * 2.4) % 2 === 0 ? '1' : '0.05') : '0';
    }

    /*
      MATCH FOUND arrives as an impact, not a fade.

      `impact` overshoots hard and snaps back inside a fifth of a second, which
      is the difference between a banner appearing and a system announcing
      something.
    */
    if (matchRef.current) {
      const p = span(t, 1.55, 2.1);
      const e = impact(p);
      matchRef.current.style.opacity = String(clamp(p * 3));
      matchRef.current.style.transform = `scale(${mix(1.7, 1, e)})`;
      matchRef.current.style.letterSpacing = `${mix(2.4, 0.5, e)}vmin`;
    }

    // A single frame of light on the impact — the flash a slam gives off.
    if (flashRef.current) {
      const f = span(t, 1.55, 1.62) * (1 - span(t, 1.62, 1.95));
      flashRef.current.style.opacity = String(f * 0.5);
    }

    // The two player slots lock in from opposite edges.
    for (const [ref, dir, at] of [
      [p1Ref, -1, 2.25],
      [p2Ref, 1, 2.4],
    ] as const) {
      const node = ref.current;
      if (!node) continue;
      const p = span(t, at, at + 0.7);
      const e = spring(p);
      node.style.opacity = String(clamp(p * 2.4));
      node.style.transform = `translate3d(${mix(dir * 26, 0, e)}vmin, 0, 0) scale(${mix(0.9, 1, e)})`;
    }

    // VS forms between them once both are seated.
    if (vsRef.current) {
      const p = span(t, 3.05, 3.5);
      const e = impact(p);
      vsRef.current.style.opacity = String(clamp(p * 3));
      vsRef.current.style.transform = `scale(${mix(2.1, 1, e)}) rotate(${mix(-14, 0, easeOut(p))}deg)`;
    }
  });

  return (
    <AdScene id="boot">
      <div
        ref={flashRef}
        className="pointer-events-none absolute inset-0 bg-cream"
        style={{ opacity: 0, willChange: 'opacity' }}
      />

      <div className="flex flex-col items-center gap-[2.4vmin]">
        <div className="font-mono text-[1.6vmin] tracking-[0.32em] text-cream/45">
          <HudLabel from={0.15}>BLENDERBATTLE SYSTEM</HudLabel>
        </div>

        <div className="flex items-center gap-[0.6vmin] font-mono text-[2vmin] tracking-[0.24em] text-mint">
          <HudLabel from={0.55}>INITIALISING</HudLabel>
          <span ref={caretRef} className="inline-block h-[2.1vmin] w-[1vmin] bg-mint" />
        </div>

        <div
          ref={matchRef}
          className="font-display text-[7vmin] font-bold text-sun"
          style={{ opacity: 0, willChange: 'transform, opacity' }}
        >
          MATCH FOUND
        </div>

        {/* The two seats, and the pairing between them. */}
        <div className="mt-[2vmin] flex items-center gap-[3vmin]">
          <PlayerSlot ref={p1Ref} index="01" tone="aqua" />

          <div
            ref={vsRef}
            className="font-display text-[6vmin] font-bold text-cream"
            style={{ opacity: 0, willChange: 'transform, opacity' }}
          >
            VS
          </div>

          <PlayerSlot ref={p2Ref} index="02" tone="punch" />
        </div>

        <div className="mt-[1vmin] font-mono text-[1.3vmin] tracking-[0.3em] text-cream/40">
          <HudLabel from={3.5}>ROUND 01 · READY</HudLabel>
        </div>
      </div>
    </AdScene>
  );
}

/** One seat at the match: an anonymous player card. */
function PlayerSlot({
  ref,
  index,
  tone,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  index: string;
  tone: 'aqua' | 'punch';
}) {
  return (
    <div ref={ref} style={{ opacity: 0, willChange: 'transform, opacity' }}>
      <HudFrame tone={tone} className="flex w-[26vmin] flex-col items-center gap-[1.2vmin] rounded-[1.4vmin] px-[2.4vmin] py-[2.2vmin]">
        <div
          className={`h-[7vmin] w-[7vmin] rounded-[1.6vmin] border-2 border-ink ${tone === 'aqua' ? 'bg-aqua' : 'bg-punch'}`}
          style={{ boxShadow: '0 0.7vmin 0 var(--color-ink)' }}
        />
        <span className="font-mono text-[1.3vmin] tracking-[0.3em] text-cream/70">PLAYER {index}</span>
        <span className={`font-display text-[1.9vmin] font-bold ${tone === 'aqua' ? 'text-aqua' : 'text-punch'}`}>
          ONLINE
        </span>
      </HudFrame>
    </div>
  );
}
