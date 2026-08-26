'use client';

import { useRef, useState } from 'react';

import { AdHud } from './ad-hud';
import { BootScene } from './scenes/boot-scene';
import { ChallengeScene, SubmitScene, TimerScene, VersusScene } from './scenes/build-act';
import { RevealScene, VictoryScene, VotingScene } from './scenes/judge-act';
import { CtaScene, MontageScene } from './scenes/close-act';
import { BEATS, RUNTIME, clamp, span } from './timeline';
import { AdClockProvider, useAdClock, useAdFrame } from './use-ad-clock';

/**
 * The whole film.
 *
 * Every scene is mounted at once and hidden until its beat — see `AdScene` for
 * why — so this component's only jobs are to hold the layers in the right order
 * and to own the controls around them.
 */
export function AdStage() {
  return (
    <AdClockProvider>
      <Stage />
    </AdClockProvider>
  );
}

function Stage() {
  const { started, reducedMotion } = useAdClock();

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-void text-cream">
      <Backdrop />

      {/* The film itself. */}
      <div className="absolute inset-0">
        <BootScene />
        <ChallengeScene />
        <VersusScene />
        <TimerScene />
        <SubmitScene />
        <RevealScene />
        <VotingScene />
        <VictoryScene />
        <MontageScene />
        <CtaScene />
      </div>

      <AdHud />

      {!started ? <StartCard reducedMotion={reducedMotion} /> : null}
      {started ? <Controls /> : null}
    </div>
  );
}

/**
 * The moving ground the whole film sits on.
 *
 * A drifting lamp and a panning dot field, both continuous. Without them the
 * gaps between beats are dead frames — and it is cheaper to keep one shared
 * background alive than to give every scene its own.
 */
function Backdrop() {
  const glowRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const heatRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    if (glowRef.current) {
      glowRef.current.style.transform =
        `translate3d(${Math.sin(t * 0.19) * 6}vmin, ${Math.cos(t * 0.15) * 3.4}vmin, 0)` +
        ` scale(${1 + Math.sin(t * 0.27) * 0.06})`;
    }

    if (dotsRef.current) {
      dotsRef.current.style.transform =
        `translate3d(${(t * 0.5) % 4.2}vmin, ${(t * 0.31) % 4.2}vmin, 0)`;
    }

    /*
      The room warms as the round gets tense and cools once it is decided.

      It is a single colour wash nobody consciously notices, which is exactly
      the point: the frame should feel different at 22 seconds than at 50
      without the viewer being able to say why.
    */
    if (heatRef.current) {
      const tension = span(t, 16, 27) * (1 - span(t, 27.5, 29));
      const triumph = span(t, 41, 42.4) * (1 - span(t, 50, 53));
      heatRef.current.style.opacity = String(clamp(tension * 0.5 + triumph * 0.32));
      heatRef.current.style.background =
        triumph > tension
          ? 'radial-gradient(closest-side, rgba(255,210,63,.5), transparent 70%)'
          : 'radial-gradient(closest-side, rgba(255,61,154,.45), transparent 70%)';
    }
  });

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div
        ref={glowRef}
        className="absolute left-1/2 top-[-12%] h-[120vmin] w-[160vmin] -translate-x-1/2"
        style={{
          background: 'radial-gradient(closest-side, #3a2f9e 0%, #221a63 46%, transparent 72%)',
          willChange: 'transform',
        }}
      />
      <div
        ref={heatRef}
        className="absolute left-1/2 top-1/2 h-[140vmin] w-[140vmin] -translate-x-1/2 -translate-y-1/2"
        style={{ opacity: 0, willChange: 'opacity' }}
      />
      <div
        ref={dotsRef}
        className="absolute inset-[-10%]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,.055) .22vmin, transparent .24vmin)',
          backgroundSize: '4.2vmin 4.2vmin',
          willChange: 'transform',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(closest-side, transparent 52%, rgba(6,4,20,.6) 100%)',
        }}
      />
    </div>
  );
}

/**
 * The way in.
 *
 * A deliberate press rather than autoplay, for two reasons that happen to
 * agree: a browser will not let a page make noise until someone has interacted
 * with it, and a fifty-five second film that starts itself while somebody is
 * still reading is rude.
 */
function StartCard({ reducedMotion }: { reducedMotion: boolean }) {
  const { play, seek } = useAdClock();

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-void/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-[2.4vmin] px-6 text-center">
        <span className="font-mono text-[1.5vmin] tracking-[0.34em] text-cream/50">
          BLENDERBATTLE · TRAILER
        </span>
        <h1 className="font-arcade text-[7vmin] font-bold leading-none text-cream">
          BLENDER<span className="text-flame">BATTLE</span>
        </h1>
        <p className="max-w-[70vmin] text-[2vmin] font-extrabold text-cream/60">
          Fifty-five seconds. One brief, two artists, one deadline.
        </p>

        <button
          type="button"
          onClick={play}
          className="mt-[1vmin] rounded-[1.8vmin] border-[0.45vmin] border-ink bg-linear-to-b from-flame-lift to-flame px-[5vmin] py-[2vmin] font-display text-[3vmin] font-bold text-ink transition-transform hover:-translate-y-[0.3vmin]"
          style={{ boxShadow: '0 1vmin 0 var(--color-ink)' }}
        >
          ▶ PLAY
        </button>

        {reducedMotion ? (
          <button
            type="button"
            onClick={() => seek(RUNTIME - 1.4)}
            className="text-[1.6vmin] font-extrabold text-aqua underline underline-offset-4"
          >
            Skip to the end card
          </button>
        ) : null}

        {reducedMotion ? (
          <p className="max-w-[64vmin] text-[1.5vmin] font-bold text-cream/45">
            Your system asks for reduced motion, so the 3D is switched off. The
            film still plays if you want it.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Transport controls: play, pause, scrub, and jump to a beat.
 *
 * The scrubber is only possible because scenes are pure functions of time —
 * any timestamp can be drawn without having played the ones before it.
 */
function Controls() {
  const { playing, toggle, seek, restart, finished } = useAdClock();
  const trackRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);

  useAdFrame((t) => {
    if (headRef.current) headRef.current.style.transform = `scaleX(${clamp(t / RUNTIME)})`;
  });

  const scrubTo = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    seek(((clientX - rect.left) / rect.width) * RUNTIME);
  };

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-40 flex flex-col gap-2 px-4 pb-4 pt-10 transition-opacity"
      style={{ opacity: hovering || !playing ? 1 : 0.18 }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Beat markers, so the timeline reads as a shot list rather than a bar. */}
      <div className="flex items-center gap-2 px-1">
        {BEATS.map((beat) => (
          <button
            key={beat.id}
            type="button"
            onClick={() => seek(beat.from + 0.02)}
            className="flex-1 truncate rounded border border-cream/10 bg-white/[0.04] px-1 py-1 font-mono text-[9px] uppercase tracking-widest text-cream/45 hover:border-sun/50 hover:text-sun"
          >
            {beat.id}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={finished ? restart : toggle}
          className="grid h-9 w-9 flex-none place-items-center rounded-full border-2 border-ink bg-sun font-display text-sm font-bold text-ink"
        >
          {finished ? '↻' : playing ? '❙❙' : '▶'}
        </button>

        <div
          ref={trackRef}
          className="relative h-2 flex-1 cursor-pointer overflow-hidden rounded-full bg-cream/10"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            scrubTo(event.clientX);
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) scrubTo(event.clientX);
          }}
        >
          <div
            ref={headRef}
            className="h-full origin-left rounded-full bg-linear-to-r from-sun to-flame"
            style={{ transform: 'scaleX(0)', willChange: 'transform' }}
          />
        </div>
      </div>
    </div>
  );
}
