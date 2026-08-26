'use client';

import { useMemo, useRef } from 'react';

import { clamp, easeOut, mix, span, spring, stagger } from './timeline';
import { useAdFrame } from './use-ad-clock';

/**
 * The pieces every scene is built from.
 *
 * All of them take absolute film times rather than scene-relative ones. Scenes
 * already know where they sit, and passing the real timestamp means a component
 * can be read in isolation without also holding the timeline in your head.
 */

/* ------------------------------------------------------------ typography */

/**
 * A line that arrives one letter at a time.
 *
 * The stagger is what separates "text faded in" from something designed: each
 * letter starts a fraction after the one before, so the eye is pulled along the
 * line in reading order instead of the whole block appearing at once.
 *
 * The letters are split once, in a memo. Splitting per frame would rebuild the
 * DOM sixty times a second and reset layout mid-animation.
 */
export function Kinetic({
  text,
  from,
  each = 0.026,
  className = '',
  rise = 2.4,
  tone,
}: {
  text: string;
  from: number;
  each?: number;
  className?: string;
  rise?: number;
  /** Colours the tail of the line, for the two-tone wordmark. */
  tone?: { after: number; className: string };
}) {
  const host = useRef<HTMLSpanElement>(null);
  const letters = useMemo(() => [...text], [text]);

  useAdFrame((t) => {
    const node = host.current;
    if (!node) return;

    const spans = node.children;
    for (let i = 0; i < spans.length; i += 1) {
      const p = stagger(t, from, each, i, 0.44);
      const e = spring(p);
      const child = spans[i] as HTMLElement;
      child.style.opacity = String(clamp(p * 1.7));
      child.style.transform =
        `translate3d(0, ${(1 - e) * rise}vmin, 0) rotate(${(1 - e) * -7}deg) scale(${mix(0.82, 1, e)})`;
    }
  });

  return (
    <span ref={host} className={className}>
      {letters.map((ch, i) => (
        <span
          key={`${ch}-${i}`}
          className={`inline-block ${tone && i >= tone.after ? tone.className : ''}`}
          style={{ willChange: 'transform, opacity', opacity: 0 }}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  );
}

/** Small monospaced interface type — the HUD voice. */
export function HudLabel({
  children,
  from,
  className = '',
}: {
  children: React.ReactNode;
  from: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useAdFrame((t) => {
    const node = ref.current;
    if (!node) return;

    /*
      Snapped on, not faded.

      Interface text that dissolves in reads as a web page. Two frames of
      flicker and then solid reads as a system printing a line, which is the
      register the whole HUD is written in.
    */
    const p = span(t, from, from + 0.2);
    const flick = p <= 0 ? 0 : p >= 1 ? 1 : Math.floor((t - from) * 34) % 2 === 0 ? 0.3 : 1;
    node.style.opacity = String(flick);
    node.style.transform = `translate3d(${(1 - easeOut(clamp(p))) * -1.1}vmin, 0, 0)`;
  });

  return (
    <span
      ref={ref}
      className={`font-mono tracking-[0.28em] uppercase ${className}`}
      style={{ willChange: 'transform, opacity', opacity: 0 }}
    >
      {children}
    </span>
  );
}

/**
 * A number that counts to its target.
 *
 * The eye reads a rising number as a value being earned; the same number
 * appearing already-final reads as a screenshot.
 */
export function Ticker({
  to,
  from,
  duration = 1.2,
  format = (n: number) => String(n),
  className = '',
}: {
  to: number;
  from: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<string>('');

  useAdFrame((t) => {
    const node = ref.current;
    if (!node) return;

    const p = span(t, from, from + duration);
    const value = format(Math.round(to * easeOut(p)));

    // Only touch the DOM when the text actually changes — at 60fps most frames
    // land on the same integer.
    if (value !== shown.current) {
      shown.current = value;
      node.textContent = value;
    }

    // A small swell as it lands.
    const pop = span(t, from + duration - 0.18, from + duration + 0.22);
    node.style.transform = `scale(${1 + Math.sin(pop * Math.PI) * 0.13})`;
  });

  return (
    <span ref={ref} className={className} style={{ willChange: 'transform' }}>
      {format(0)}
    </span>
  );
}

/* --------------------------------------------------------------- chrome */

/**
 * A HUD-framed slab: corner ticks and a thin outline.
 *
 * Deliberately not the site's `Panel`. A Panel is furniture you read at rest;
 * this is a readout being drawn on screen, and the difference in weight is what
 * keeps the film feeling like a match rather than a page tour.
 */
export function HudFrame({
  children,
  className = '',
  tone = 'sun',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'sun' | 'aqua' | 'mint' | 'punch';
}) {
  const edge = {
    sun: 'border-sun/45',
    aqua: 'border-aqua/45',
    mint: 'border-mint/45',
    punch: 'border-punch/45',
  }[tone];

  return (
    <div className={`relative border ${edge} bg-white/[0.035] backdrop-blur-[2px] ${className}`}>
      {(
        [
          '-left-px -top-px border-l-2 border-t-2',
          '-right-px -top-px border-r-2 border-t-2',
          '-bottom-px -left-px border-b-2 border-l-2',
          '-bottom-px -right-px border-b-2 border-r-2',
        ] as const
      ).map((corner) => (
        <span key={corner} className={`absolute h-[1.6vmin] w-[1.6vmin] ${edge} ${corner}`} />
      ))}
      {children}
    </div>
  );
}

/**
 * A pointer that moves between targets and clicks.
 *
 * Used twice — to submit, and to enter the arena. Both are moments where the
 * film needs to show a decision being made rather than a state changing on its
 * own, and a cursor is the shortest way to say "a person did this".
 */
export function AdCursor({
  path,
  clickAt,
  className = '',
}: {
  /** Waypoints in vmin from the centre, with the time each is reached. */
  path: { at: number; x: number; y: number }[];
  clickAt: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);

  useAdFrame((t) => {
    const node = ref.current;
    if (!node || path.length === 0) return;

    const first = path[0]!;
    const last = path[path.length - 1]!;

    let x = first.x;
    let y = first.y;

    if (t >= last.at) {
      x = last.x;
      y = last.y;
    } else {
      for (let i = 0; i < path.length - 1; i += 1) {
        const a = path[i]!;
        const b = path[i + 1]!;
        if (t >= a.at && t < b.at) {
          // Eased between waypoints, so the pointer accelerates and settles
          // rather than sliding at a constant machine-like rate.
          const p = easeOut(span(t, a.at, b.at));
          x = mix(a.x, b.x, p);
          y = mix(a.y, b.y, p);
          break;
        }
      }
    }

    const appear = span(t, first.at - 0.35, first.at);
    const press = span(t, clickAt, clickAt + 0.1) * (1 - span(t, clickAt + 0.1, clickAt + 0.24));

    node.style.opacity = String(appear);
    node.style.transform =
      `translate3d(calc(-50% + ${x}vmin), calc(-50% + ${y}vmin), 0) scale(${1 - press * 0.18})`;

    if (ringRef.current) {
      const ring = span(t, clickAt, clickAt + 0.5);
      ringRef.current.style.opacity = String((1 - ring) * 0.9);
      ringRef.current.style.transform = `translate(-50%, -50%) scale(${mix(0.2, 2.6, easeOut(ring))})`;
    }
  });

  return (
    <div
      ref={ref}
      className={`pointer-events-none absolute left-1/2 top-1/2 z-30 ${className}`}
      style={{ willChange: 'transform, opacity', opacity: 0 }}
    >
      <span
        ref={ringRef}
        className="absolute left-0 top-0 h-[4vmin] w-[4vmin] rounded-full border-2 border-sun"
        style={{ willChange: 'transform, opacity', opacity: 0 }}
      />
      {/* A pointer drawn rather than an emoji, so it matches the brand's ink outline. */}
      <svg width="2.6vmin" height="2.6vmin" viewBox="0 0 24 24" style={{ width: '2.6vmin', height: '2.6vmin' }}>
        <path
          d="M5 3l14 8.5-6.2 1.3L9.4 19z"
          fill="var(--color-cream)"
          stroke="var(--color-ink)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
