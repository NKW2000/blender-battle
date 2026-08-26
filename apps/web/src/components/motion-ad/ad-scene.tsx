'use client';

import { useRef, type ReactNode } from 'react';

import { useAdFrame } from './use-ad-clock';
import {
  BEATS,
  HANDOVER,
  HARD_CUT_AT,
  clamp,
  easeInOut,
  easeOutExpo,
  mix,
  span,
  type SceneId,
} from './timeline';

/**
 * One beat of the film, and the motion every beat shares.
 *
 * Scenes arrive travelling and leave travelling. A crossfade between two still
 * frames reads as a slideshow no matter how good either frame is, so each scene
 * rises into place with a slight push in, and leaves upward with a slight push
 * out. Because the windows overlap, there is never a frame where the whole
 * screen is motionless.
 *
 * A scene that is not on screen is `visibility: hidden` rather than unmounted:
 * mounting ten scenes once and hiding nine is far cheaper than tearing down and
 * rebuilding a DOM subtree on every cut, and it means a scrub backwards lands
 * on a scene that is already laid out.
 */
export function AdScene({
  id,
  children,
  className = '',
  /** Some beats want their own arrival, and say so. */
  transition = 'push',
}: {
  id: SceneId;
  children: ReactNode;
  className?: string;
  transition?: 'push' | 'cut' | 'zoom';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const beat = BEATS.find((b) => b.id === id)!;

  useAdFrame((t) => {
    const node = ref.current;
    if (!node) return;

    /*
      The cut at TIME'S UP is hard on both sides.

      Everything else overlaps, but this one moment is the film's spine: the
      music stops, the picture stops, and a scene easing across it would soften
      the only silence in fifty-five seconds.
    */
    const hard = transition === 'cut' || beat.from === HARD_CUT_AT || beat.to === HARD_CUT_AT;
    const fade = hard ? 0.06 : HANDOVER;

    const inP = span(t, beat.from, beat.from + fade);
    const outP = span(t, beat.to - fade, beat.to);
    const visible = clamp(inP * (1 - outP));

    node.style.opacity = String(visible);
    node.style.visibility = visible <= 0.002 ? 'hidden' : 'visible';
    // Off-screen scenes must not intercept a click on the one that is showing.
    node.style.pointerEvents = visible > 0.5 ? 'auto' : 'none';

    if (visible <= 0.002) return;

    if (transition === 'zoom') {
      // Comes at the camera rather than up into it — used where the previous
      // beat ends by pushing into something.
      const scale = mix(1.22, 1, easeOutExpo(inP)) * mix(1, 0.94, easeInOut(outP));
      node.style.transform = `scale(${scale})`;
      return;
    }

    if (hard) {
      node.style.transform = 'none';
      return;
    }

    const rise = (1 - easeOutExpo(inP)) * 5.2;
    const exit = easeInOut(outP) * -3.6;
    const scale = mix(0.972, 1, easeOutExpo(inP)) * mix(1, 1.035, easeInOut(outP));
    node.style.transform = `translate3d(0, ${rise + exit}vmin, 0) scale(${scale})`;
  });

  return (
    <div
      ref={ref}
      data-scene={id}
      aria-hidden="true"
      className={`absolute inset-0 flex flex-col items-center justify-center px-[6vmin] ${className}`}
      // `will-change` on ten scenes is deliberate: each one is promoted to its
      // own layer, so a scene arriving never forces the others to repaint.
      style={{ willChange: 'opacity, transform', visibility: 'hidden', opacity: 0 }}
    >
      {children}
    </div>
  );
}

/**
 * Time since this scene began.
 *
 * Scenes are written against their own zero so that moving a beat in
 * `timeline.ts` does not mean re-timing everything inside it.
 */
export function localTime(t: number, id: SceneId) {
  const beat = BEATS.find((b) => b.id === id)!;
  return t - beat.from;
}
