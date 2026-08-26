/**
 * The film's clock, in one place.
 *
 * Every scene reads its timing from here rather than holding its own numbers,
 * so re-cutting the ad is editing this file. The boundaries are also what the
 * audio cues line up against, which is why they are plain data rather than
 * being derived from the scenes themselves.
 */

export const RUNTIME = 55;

export interface Beat {
  id: SceneId;
  from: number;
  to: number;
}

export type SceneId =
  | 'boot'
  | 'challenge'
  | 'versus'
  | 'timer'
  | 'submit'
  | 'reveal'
  | 'voting'
  | 'victory'
  | 'montage'
  | 'cta';

export const BEATS: Beat[] = [
  { id: 'boot', from: 0, to: 4 },
  { id: 'challenge', from: 4, to: 9 },
  { id: 'versus', from: 9, to: 16 },
  { id: 'timer', from: 16, to: 23 },
  { id: 'submit', from: 23, to: 28 },
  { id: 'reveal', from: 28, to: 35 },
  { id: 'voting', from: 35, to: 41 },
  { id: 'victory', from: 41, to: 46 },
  { id: 'montage', from: 46, to: 51 },
  { id: 'cta', from: 51, to: RUNTIME },
];

/**
 * How long a scene takes to arrive and to leave.
 *
 * Scenes overlap by this much, which is what keeps something moving at every
 * boundary. A cut with nothing in motion on either side of it reads as a
 * slideshow however good the two slides are.
 */
export const HANDOVER = 0.42;

/*
  The one exception is the cut at TIME'S UP.

  The whole point of that moment is that everything stops at once — picture and
  sound together. Easing through it would soften exactly the beat the film is
  built around.
*/
export const HARD_CUT_AT = 28;

/* ------------------------------------------------------------- easings */

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Progress through a window, 0..1. */
export const span = (t: number, from: number, to: number) => clamp((t - from) / (to - from));

export const mix = (a: number, b: number, p: number) => a + (b - a) * p;

export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
export const easeIn = (p: number) => p * p * p;
export const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

/** Fast, then a long settle — the curve most UI motion wants. */
export const easeOutExpo = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

/** Overshoots the target and comes back. The arcade bounce. */
export function overshoot(p: number, amount = 1.70158) {
  const c = amount + 1;
  return 1 + c * Math.pow(p - 1, 3) + amount * Math.pow(p - 1, 2);
}

/** Settles with a few diminishing wobbles, like something with mass. */
export function spring(p: number, bounces = 3) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return 1 - Math.pow(2, -9 * p) * Math.cos(((p * 9 - 0.75) * (Math.PI * 2)) / bounces);
}

/** A single impact: slams past, snaps back, holds. */
export function impact(p: number) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return 1 - Math.pow(2, -14 * p) * Math.cos(p * 16);
}

/**
 * Staggers an index inside a window.
 *
 * Returns that item's own 0..1 progress, so a row of things can be given one
 * window and still arrive one after another.
 */
export function stagger(local: number, from: number, each: number, index: number, length = 0.5) {
  const start = from + index * each;
  return span(local, start, start + length);
}

/** Whole-number counting, for scores and XP. */
export const countTo = (target: number, p: number) => Math.round(target * easeInOut(p));

/**
 * A short shake that decays.
 *
 * Used on impacts. Deterministic — driven by the timestamp rather than random —
 * so the same moment shakes the same way every time it is watched.
 */
export function shake(local: number, at: number, strength = 1, length = 0.42) {
  const p = span(local, at, at + length);
  if (p <= 0 || p >= 1) return { x: 0, y: 0 };

  const decay = 1 - p;
  const phase = (local - at) * 62;
  return {
    x: Math.sin(phase) * strength * decay,
    y: Math.cos(phase * 1.37) * strength * decay * 0.7,
  };
}
