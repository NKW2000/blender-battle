'use client';

import Link from 'next/link';
import { useRef } from 'react';

import { ArcadeLogo } from '@/components/arcade/chunky';

import { AdCursor, HudFrame, HudLabel, Kinetic } from '../ad-parts';
import { AdScene } from '../ad-scene';
import { clamp, easeOut, easeOutExpo, impact, mix, span, spring } from '../timeline';
import { useAdFrame } from '../use-ad-clock';

/**
 * The closing act: the size of the place, then the way in.
 */

/* -------------------------------------------------------- 46–51s  MONTAGE */

/**
 * Six faces of the product, each held for well under a second.
 *
 * The brief's warning is the important part: this must not read as a feature
 * list. So the cards do not queue up politely — they fly through on a diagonal,
 * overlapping, each one arriving before the last has left, which is how a
 * montage says "there is a lot of this" rather than "here are six things".
 */
const FACES = [
  { label: 'PUBLIC CHALLENGES', tone: 'sun', at: 46.15 },
  { label: 'LIVE BATTLES', tone: 'punch', at: 46.75 },
  { label: 'PRIVATE ROOMS', tone: 'aqua', at: 47.35 },
  { label: 'COMMUNITY VOTING', tone: 'mint', at: 47.95 },
  { label: 'PLAYER PROFILE', tone: 'aqua', at: 48.55 },
  { label: 'PORTFOLIO', tone: 'sun', at: 49.15 },
] as const;

export function MontageScene() {
  const hostRef = useRef<HTMLDivElement>(null);
  const arenaRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    const host = hostRef.current;
    if (host) {
      for (let i = 0; i < host.children.length; i += 1) {
        const face = FACES[i]!;
        const child = host.children[i] as HTMLElement;

        const p = span(t, face.at, face.at + 0.95);
        const e = easeOutExpo(p);

        /*
          Each card travels a diagonal through the frame rather than fading in
          place, and rotates slightly as it goes. Movement across the frame is
          what the eye reads as pace; opacity alone reads as a slideshow however
          fast it is cut.
        */
        const travel = mix(1, -1, e);
        child.style.opacity = String(clamp(p * 3) * (1 - span(t, face.at + 0.75, face.at + 1.05)));
        child.style.transform =
          `translate3d(${travel * 26}vmin, ${travel * -9}vmin, 0)` +
          ` rotate(${travel * 7}deg) scale(${mix(0.7, 1.02, e)})`;
        child.style.zIndex = String(i);
      }
    }

    // The word the montage is building towards.
    if (arenaRef.current) {
      const p = span(t, 49.9, 50.5);
      arenaRef.current.style.opacity = String(clamp(p * 2.5));
      arenaRef.current.style.transform = `scale(${mix(1.5, 1, impact(p))})`;
    }
  });

  return (
    <AdScene id="montage">
      <div ref={hostRef} className="absolute inset-0 grid place-items-center">
        {FACES.map((face) => (
          <div
            key={face.label}
            className="absolute"
            style={{ opacity: 0, willChange: 'transform, opacity' }}
          >
            <HudFrame
              tone={face.tone}
              className="grid h-[30vmin] w-[46vmin] place-items-center rounded-[1.6vmin]"
            >
              <span className="font-display text-[3.4vmin] font-bold leading-none text-cream">
                {face.label}
              </span>
            </HudFrame>
          </div>
        ))}
      </div>

      <div
        ref={arenaRef}
        className="absolute bottom-[14vmin] font-display text-[6.4vmin] font-bold leading-none text-sun"
        style={{ opacity: 0, willChange: 'transform, opacity' }}
      >
        ONE ARENA
      </div>
    </AdScene>
  );
}

/* ------------------------------------------------------------ 51–55s  CTA */

export function CtaScene() {
  const logoRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const taglineRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    if (logoRef.current) {
      const p = span(t, 51.1, 51.9);
      const e = spring(p);
      const idle = Math.sin(Math.max(0, t - 52.2) * 1.7) * 0.02;
      logoRef.current.style.opacity = String(clamp(p * 2.4));
      logoRef.current.style.transform = `scale(${mix(0.35, 1, e) + idle}) rotate(${mix(-40, 0, easeOutExpo(p))}deg)`;
    }

    for (const [ref, at] of [
      [wordRef, 51.5],
      [taglineRef, 51.95],
      [urlRef, 53.35],
    ] as const) {
      const node = ref.current;
      if (!node) continue;
      const p = span(t, at, at + 0.55);
      node.style.opacity = String(clamp(p * 2));
      node.style.transform = `translate3d(0, ${(1 - easeOut(p)) * 2}vmin, 0)`;
    }

    /*
      The button is pressed, and then comes at the camera.

      That last move is the film handing over: the control stops being something
      on screen and becomes the thing the viewer is about to do.
    */
    if (buttonRef.current) {
      const appear = span(t, 52.35, 52.95);
      const press = span(t, 53.5, 53.6) * (1 - span(t, 53.6, 53.78));
      const launch = span(t, 53.85, 55);

      buttonRef.current.style.opacity = String(appear);
      buttonRef.current.style.transform =
        `translate3d(0, ${press * 0.8}vmin, 0)` +
        ` scale(${mix(0.86, 1, spring(appear)) - press * 0.04 + easeOutExpo(launch) * 0.9})`;
    }

    // A rule that wipes under the address.
    if (lineRef.current) lineRef.current.style.transform = `scaleX(${easeOut(span(t, 53.6, 54.4))})`;
  });

  return (
    <AdScene id="cta">
      <div className="flex flex-col items-center">
        <div ref={logoRef} style={{ opacity: 0, willChange: 'transform, opacity' }}>
          <ArcadeLogo size={78} />
        </div>

        <div
          ref={wordRef}
          className="mt-[4.4vmin] font-arcade text-[8vmin] font-bold leading-none tracking-wide text-cream"
          style={{ opacity: 0, willChange: 'transform, opacity' }}
        >
          BLENDER<span className="text-flame">BATTLE</span>
        </div>

        {/*
          The tagline builds a letter at a time.

          It is the line the film wants remembered, and letters arriving in
          reading order hold the eye on it for longer than the same words simply
          appearing would.
        */}
        <div
          ref={taglineRef}
          className="mt-[2.2vmin] font-display text-[3.4vmin] font-bold tracking-[0.2em] text-sun"
          style={{ opacity: 0, willChange: 'transform, opacity' }}
        >
          <Kinetic text="MODEL. BATTLE. CLIMB." from={52.05} each={0.022} rise={1.6} />
        </div>

        <div className="mt-[1.2vmin] font-mono text-[1.4vmin] tracking-[0.32em] text-cream/45">
          <HudLabel from={52.15}>WHERE BLENDER ARTISTS COMPETE</HudLabel>
        </div>

        {/*
          The real control, and a real link.

          This is the one interactive element in fifty-five seconds — the film
          ends by handing the viewer the actual way in, not a picture of one.
        */}
        <div ref={buttonRef} className="mt-[4vmin]" style={{ opacity: 0, willChange: 'transform, opacity' }}>
          <Link
            href="/"
            className="pointer-events-auto inline-flex items-center gap-[1.2vmin] rounded-[1.8vmin] border-[0.45vmin] border-ink bg-linear-to-b from-flame-lift to-flame px-[5.4vmin] py-[2.2vmin] font-display text-[3.4vmin] font-bold text-ink transition-transform hover:-translate-y-[0.3vmin]"
            style={{ boxShadow: '0 1vmin 0 var(--color-ink)' }}
          >
            ENTER THE ARENA <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div ref={urlRef} className="relative mt-[3vmin]" style={{ opacity: 0, willChange: 'transform, opacity' }}>
          <span className="font-display text-[2.6vmin] font-bold tracking-[0.14em] text-aqua">
            blenderbattle.vercel.app
          </span>
          <div
            ref={lineRef}
            className="absolute -bottom-[0.9vmin] left-0 right-0 h-[0.3vmin] origin-left rounded-full bg-aqua"
            style={{ transform: 'scaleX(0)', willChange: 'transform' }}
          />
        </div>
      </div>

      <AdCursor
        path={[
          { at: 52.9, x: 20, y: 13 },
          { at: 53.5, x: 4, y: 3 },
        ]}
        clickAt={53.5}
      />
    </AdScene>
  );
}
