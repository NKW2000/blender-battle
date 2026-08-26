'use client';

import { useRef } from 'react';

import { AdMesh } from '../ad-mesh';
import { AdCursor, HudFrame, HudLabel } from '../ad-parts';
import { AdScene } from '../ad-scene';
import { clamp, easeOut, easeOutExpo, impact, mix, shake, span, spring, stagger } from '../timeline';
import { useAdFrame } from '../use-ad-clock';

/**
 * The build act: the brief lands, two artists take it on, the clock runs out.
 *
 * These four beats live in one file because they are one continuous movement —
 * the timer that starts in `ChallengeScene` is the same timer that hits zero in
 * `SubmitScene`, and keeping them together is what stops the numbers drifting
 * apart when the timing is edited.
 */

/** Formats seconds as the match clock every scene here shares. */
const clock = (seconds: number) =>
  `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;

/* ------------------------------------------------------- 4–9s  CHALLENGE */

export function ChallengeScene() {
  const cardRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const oneBriefRef = useRef<HTMLDivElement>(null);
  const oneDeadlineRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    /*
      The card arrives face-on out of a flip.

      A card that slides reads as a UI element; one that rotates in on its own
      axis reads as something being dealt to you, which is what a brief is.
    */
    if (cardRef.current) {
      const p = span(t, 4.15, 5.1);
      const e = spring(p);
      cardRef.current.style.opacity = String(clamp(p * 2.6));
      cardRef.current.style.transform =
        `perspective(120vmin) rotateY(${mix(-78, 0, easeOutExpo(p))}deg)` +
        ` translate3d(0, ${mix(4, 0, e)}vmin, 0) scale(${mix(0.82, 1, e)})`;
    }

    // 10:00 appears, holds, then starts running as the beat ends.
    if (timeRef.current) {
      const started = span(t, 6.5, 9);
      timeRef.current.textContent = clock(600 - started * 12);
    }

    // The two lines of the promise, one after the other.
    for (const [ref, at] of [
      [oneBriefRef, 6.35],
      [oneDeadlineRef, 7.5],
    ] as const) {
      const node = ref.current;
      if (!node) continue;
      const p = span(t, at, at + 0.5);
      node.style.opacity = String(clamp(p * 2));
      node.style.transform = `translate3d(0, ${(1 - impact(p)) * 2.2}vmin, 0) scale(${mix(1.16, 1, impact(p))})`;
    }
  });

  return (
    <AdScene id="challenge">
      <div className="flex flex-col items-center gap-[3.4vmin]">
        <div ref={cardRef} style={{ opacity: 0, willChange: 'transform, opacity' }}>
          <HudFrame tone="sun" className="w-[52vmin] rounded-[1.8vmin] px-[3.4vmin] py-[3vmin]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[1.3vmin] tracking-[0.3em] text-sun">CHALLENGE</span>
              <span className="font-mono text-[1.3vmin] tracking-[0.3em] text-cream/45">MODELING</span>
            </div>

            <p className="mt-[1.6vmin] font-display text-[4.6vmin] font-bold leading-none text-cream">
              Build: <span className="text-sun">a couch</span>
            </p>

            <div className="mt-[2.4vmin] flex items-end justify-between border-t border-cream/12 pt-[2vmin]">
              <div className="flex flex-col">
                <span className="font-mono text-[1.15vmin] tracking-[0.28em] text-cream/45">TIME</span>
                <span
                  ref={timeRef}
                  className="font-display text-[5.6vmin] font-bold leading-none text-sun tabular-nums"
                >
                  10:00
                </span>
              </div>
              <span className="rounded-full border-2 border-ink bg-punch px-[1.6vmin] py-[0.6vmin] font-display text-[1.5vmin] font-bold text-cream">
                HARD
              </span>
            </div>
          </HudFrame>
        </div>

        <div className="flex flex-col items-center gap-[0.8vmin]">
          <div
            ref={oneBriefRef}
            className="font-display text-[6.4vmin] font-bold leading-none text-cream"
            style={{ opacity: 0, willChange: 'transform, opacity' }}
          >
            ONE BRIEF.
          </div>
          <div
            ref={oneDeadlineRef}
            className="font-display text-[6.4vmin] font-bold leading-none text-sun"
            style={{ opacity: 0, willChange: 'transform, opacity' }}
          >
            ONE DEADLINE.
          </div>
        </div>
      </div>
    </AdScene>
  );
}

/* --------------------------------------------------------- 9–16s  VERSUS */

export function VersusScene() {
  const vsRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    // The two halves drive in from their own sides.
    for (const [ref, dir, at] of [
      [leftRef, -1, 9.3],
      [rightRef, 1, 9.45],
    ] as const) {
      const node = ref.current;
      if (!node) continue;
      const p = span(t, at, at + 0.85);
      const e = spring(p);
      node.style.opacity = String(clamp(p * 2.4));
      const wide = window.matchMedia("(min-width: 768px)").matches;
      node.style.transform = wide
        ? `translate3d(${mix(dir * 40, 0, e)}vmin, 0, 0)`
        : `translate3d(0, ${mix(dir * 12, 0, e)}vmin, 0)`;
    }

    /*
      VS slams in late, and shakes the split behind it.

      The shake is on the container rather than the letters: an impact that only
      moves the thing that caused it looks like an animation, while an impact
      that moves everything around it looks like force.
    */
    if (vsRef.current) {
      const p = span(t, 12.6, 13.15);
      const e = impact(p);
      vsRef.current.style.opacity = String(clamp(p * 4));
      vsRef.current.style.transform = `scale(${mix(3.4, 1, e)}) rotate(${mix(-16, -6, easeOut(p))}deg)`;
    }

    if (splitRef.current) {
      const jolt = shake(t, 12.62, 1.1, 0.5);
      splitRef.current.style.transform = `translate3d(${jolt.x}vmin, ${jolt.y}vmin, 0)`;
    }
  });

  return (
    <AdScene id="versus">
      {/*
        Stacked on a phone, side by side from `md`.

        A split screen is the whole point of this beat, and on a 375px display
        two columns leave each artist about 165px — too narrow for a 3D viewport
        and a label list to read as anything. Stacking keeps both artists at full
        width and lets VS sit between them, which is the same idea in the shape
        the frame can actually hold.
      */}
      <div
        ref={splitRef}
        className="relative flex w-full max-w-[150vmin] flex-col items-stretch justify-center gap-[2vmin] md:flex-row"
        style={{ willChange: 'transform' }}
      >
        <ArtistHalf
          ref={leftRef}
          index="01"
          tone="aqua"
          shape="cube"
          color={0x4ad4ff}
          labels={['MESH', 'BEVEL', 'SUBDIV']}
          from={9.6}
        />

        <div
          ref={vsRef}
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 font-display text-[13vmin] font-bold leading-none text-cream"
          style={{
            opacity: 0,
            willChange: 'transform, opacity',
            textShadow: '0 1.2vmin 0 var(--color-ink)',
          }}
        >
          VS
        </div>

        <ArtistHalf
          ref={rightRef}
          index="02"
          tone="punch"
          shape="torus"
          color={0xff3d9a}
          labels={['SCULPT', 'RETOPO', 'SHADE']}
          from={9.75}
        />
      </div>
    </AdScene>
  );
}

/** One side of the split: a player, their object, and what they are doing to it. */
function ArtistHalf({
  ref,
  index,
  tone,
  shape,
  color,
  labels,
  from,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  index: string;
  tone: 'aqua' | 'punch';
  shape: 'cube' | 'torus';
  color: number;
  labels: string[];
  from: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    const node = listRef.current;
    if (!node) return;

    // The operations tick on one after another, like a modelling log.
    for (let i = 0; i < node.children.length; i += 1) {
      const p = stagger(t, from + 1.1, 0.55, i, 0.35);
      const child = node.children[i] as HTMLElement;
      child.style.opacity = String(clamp(p * 1.4));
      child.style.transform = `translate3d(${(1 - easeOut(p)) * -1.4}vmin, 0, 0)`;
    }
  });

  return (
    <div ref={ref} className="flex-1" style={{ opacity: 0, willChange: 'transform, opacity' }}>
      <HudFrame tone={tone} className="flex h-full flex-col rounded-[1.6vmin] px-[2.6vmin] py-[2.4vmin]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[1.3vmin] tracking-[0.3em] text-cream/70">PLAYER {index}</span>
          <span className={`font-mono text-[1.2vmin] tracking-[0.28em] ${tone === 'aqua' ? 'text-aqua' : 'text-punch'}`}>
            BUILDING
          </span>
        </div>

        <AdMesh
          shape={shape}
          color={color}
          solidFrom={from + 2.2}
          solidTo={from + 5.4}
          spin={tone === 'aqua' ? 0.62 : -0.5}
          className="mx-auto my-[1.4vmin] h-[22vmin] w-full md:h-[34vmin]"
        />

        <div ref={listRef} className="flex flex-col gap-[0.5vmin] font-mono text-[1.25vmin] tracking-[0.26em] text-cream/55">
          {labels.map((label) => (
            <span key={label} style={{ opacity: 0, willChange: 'transform, opacity' }}>
              › {label}
            </span>
          ))}
        </div>
      </HudFrame>
    </div>
  );
}

/* ---------------------------------------------------------- 16–23s  TIMER */

const PIPELINE = ['MODELING', 'LIGHTING', 'MATERIAL', 'CAMERA', 'RENDER'];

export function TimerScene() {
  const digitsRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    /*
      The clock does not run smoothly — it jumps.

      Real pressure in a trailer comes from cutting time out, not from watching
      it pass, so the readout lands on 05:00, 03:00, 01:00 and 00:30 and holds
      at each. The jumps are the edit; the beat between them is the tension.
    */
    const marks = [
      { at: 16.2, value: 300 },
      { at: 17.9, value: 180 },
      { at: 19.5, value: 60 },
      { at: 21.0, value: 30 },
    ];
    let value = 300;
    let landedAt = 16.2;
    for (const mark of marks) {
      if (t >= mark.at) {
        value = mark.value;
        landedAt = mark.at;
      }
    }
    // Between marks it still ticks down, so it never looks frozen.
    const drift = Math.floor((t - landedAt) * 2);

    if (digitsRef.current) {
      digitsRef.current.textContent = clock(value - drift);

      // Each jump lands with a hit, and the hits get harder as time shortens.
      const since = t - landedAt;
      const hit = span(t, landedAt, landedAt + 0.3);
      const weight = 1 + marks.findIndex((m) => m.at === landedAt) * 0.16;
      digitsRef.current.style.transform =
        `scale(${mix(1.22 * weight, 1, impact(hit))})`;
      digitsRef.current.style.color = since < 0.2 ? 'var(--color-cream)' : 'var(--color-sun)';
    }

    // The ring drains with the clock.
    if (ringRef.current) {
      const p = clamp((300 - (value - drift)) / 300);
      ringRef.current.style.strokeDashoffset = String(628 * p);
    }

    // The pipeline labels scroll past, faster as the clock shortens.
    if (stackRef.current) {
      const speed = 9 + span(t, 16, 23) * 26;
      stackRef.current.style.transform = `translate3d(0, ${-((t * speed) % 24)}vmin, 0)`;
    }

    // A heartbeat behind everything, quickening.
    if (pulseRef.current) {
      const rate = 1.6 + span(t, 16, 23) * 3.4;
      const beat = Math.pow(Math.abs(Math.sin(t * rate)), 6);
      pulseRef.current.style.opacity = String(0.05 + beat * 0.16);
      pulseRef.current.style.transform = `scale(${1 + beat * 0.06})`;
    }
  });

  return (
    <AdScene id="timer">
      <div
        ref={pulseRef}
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(closest-side, var(--color-punch), transparent 62%)',
          opacity: 0,
          willChange: 'transform, opacity',
        }}
      />

      {/* The pipeline, running behind the clock on both sides. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-[9vmin] opacity-40">
        {[0, 1].map((side) => (
          <div key={side} className="h-[60vmin] overflow-hidden">
            <div ref={side === 0 ? stackRef : undefined} style={{ willChange: 'transform' }}>
              {[...PIPELINE, ...PIPELINE, ...PIPELINE].map((label, i) => (
                <div
                  key={`${label}-${i}`}
                  className="h-[4.8vmin] font-mono text-[1.5vmin] tracking-[0.3em] text-cream/50"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="relative grid place-items-center">
        <svg viewBox="0 0 220 220" className="h-[54vmin] w-[54vmin] -rotate-90">
          <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255,246,233,.09)" strokeWidth="3" />
          <circle
            ref={ringRef}
            cx="110"
            cy="110"
            r="100"
            fill="none"
            stroke="var(--color-sun)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="628"
            strokeDashoffset="0"
          />
        </svg>

        <div
          ref={digitsRef}
          className="absolute font-display text-[16vmin] font-bold leading-none text-sun tabular-nums"
          style={{ willChange: 'transform' }}
        >
          05:00
        </div>
      </div>

      <div className="absolute bottom-[12vmin] font-mono text-[1.5vmin] tracking-[0.34em] text-cream/50">
        <HudLabel from={16.4}>TIME REMAINING</HudLabel>
      </div>
    </AdScene>
  );
}

/* --------------------------------------------------------- 23–28s  SUBMIT */

export function SubmitScene() {
  const countRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLDivElement>(null);
  const whiteRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    // Three, two, one — each digit its own impact.
    if (countRef.current) {
      const steps = [
        { at: 23.15, label: '00:03' },
        { at: 23.95, label: '00:02' },
        { at: 24.75, label: '00:01' },
      ];
      const current = [...steps].reverse().find((s) => t >= s.at);
      const done = t >= 25.6;

      countRef.current.style.opacity = current && !done ? '1' : '0';
      if (current && !done) {
        countRef.current.textContent = current.label;
        const p = span(t, current.at, current.at + 0.34);
        countRef.current.style.transform = `scale(${mix(2.4, 1, impact(p))})`;
        countRef.current.style.color = current.label === '00:01' ? 'var(--color-punch)' : 'var(--color-sun)';
      }
    }

    // The cursor reaches the button and presses it.
    if (buttonRef.current) {
      const appear = span(t, 23.3, 23.8);
      const press = span(t, 25.5, 25.6) * (1 - span(t, 25.6, 25.78));
      buttonRef.current.style.opacity = String(appear);
      buttonRef.current.style.transform = `translate3d(0, ${press * 0.7}vmin, 0) scale(${mix(0.9, 1, easeOut(appear)) - press * 0.03})`;
    }

    if (doneRef.current) {
      const p = span(t, 25.75, 26.1);
      doneRef.current.style.opacity = String(clamp(p * 3));
      doneRef.current.style.transform = `scale(${mix(1.5, 1, impact(p))})`;
    }

    /*
      TIME'S UP is the hardest hit in the film.

      It lands on a white frame, at the same instant the music stops. The stamp
      arrives rotated and oversized and snaps flat, which is the gesture of
      something being pressed onto the screen rather than appearing on it.
    */
    if (stampRef.current) {
      const p = span(t, 26.6, 27.1);
      const e = impact(p);
      stampRef.current.style.opacity = String(clamp(p * 4));
      stampRef.current.style.transform =
        `scale(${mix(3.2, 1, e)}) rotate(${mix(-22, -7, easeOutExpo(p))}deg)`;
    }

    if (whiteRef.current) {
      const flash = span(t, 26.6, 26.68) * (1 - span(t, 26.68, 27.05));
      whiteRef.current.style.opacity = String(flash * 0.72);
    }
  });

  return (
    <AdScene id="submit">
      <div
        ref={whiteRef}
        className="pointer-events-none absolute inset-0 z-10 bg-cream"
        style={{ opacity: 0, willChange: 'opacity' }}
      />

      <div
        ref={countRef}
        className="absolute top-[16vmin] font-display text-[11vmin] font-bold leading-none tabular-nums text-sun"
        style={{ opacity: 0, willChange: 'transform' }}
      >
        00:03
      </div>

      {/* The submit control, and the pointer that presses it. */}
      <div ref={buttonRef} style={{ opacity: 0, willChange: 'transform, opacity' }}>
        <div
          className="rounded-[1.8vmin] border-[0.45vmin] border-ink bg-linear-to-b from-flame-lift to-flame px-[6vmin] py-[2.4vmin] font-display text-[4vmin] font-bold text-ink"
          style={{ boxShadow: '0 1vmin 0 var(--color-ink)' }}
        >
          SUBMIT ENTRY
        </div>
      </div>

      <AdCursor
        path={[
          { at: 24.2, x: 22, y: 15 },
          { at: 25.5, x: 3, y: 2 },
        ]}
        clickAt={25.5}
      />

      <div
        ref={doneRef}
        className="absolute bottom-[20vmin] font-mono text-[2.2vmin] tracking-[0.36em] text-mint"
        style={{ opacity: 0, willChange: 'transform, opacity' }}
      >
        SUBMITTED
      </div>

      <div
        ref={stampRef}
        className="absolute z-20 border-[0.9vmin] border-punch px-[5vmin] py-[1.6vmin] font-display text-[9vmin] font-bold leading-none text-punch"
        style={{ opacity: 0, willChange: 'transform, opacity' }}
      >
        TIME&rsquo;S UP
      </div>
    </AdScene>
  );
}
