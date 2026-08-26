import { describe, expect, it } from 'vitest';

import { swipeTarget } from './brief-parts';

/**
 * The reference carousel's gesture.
 *
 * The decision is a pure function so the part that is easy to get wrong — a tap
 * counting as a swipe, a drag going the wrong way, the ends not wrapping — is
 * testable without a touch screen.
 */

const WIDTH = 400; // threshold is 18% of this, so 72px

describe('deciding what a drag meant', () => {
  it('advances when the track is dragged left', () => {
    // Dragging left pulls the next slide into view, the way a page turns.
    expect(swipeTarget(-120, WIDTH, 0, 3)).toBe(1);
  });

  it('goes back when the track is dragged right', () => {
    expect(swipeTarget(120, WIDTH, 1, 3)).toBe(0);
  });

  it('ignores a tap', () => {
    /*
      The failure that would matter most: every tap moves a few pixels, and if
      those counted the arrows and the dots underneath would be unusable.
    */
    expect(swipeTarget(0, WIDTH, 1, 3)).toBe(1);
    expect(swipeTarget(-4, WIDTH, 1, 3)).toBe(1);
    expect(swipeTarget(9, WIDTH, 1, 3)).toBe(1);
  });

  it('ignores a drag that stops short of the threshold', () => {
    // A half-hearted drag snaps back rather than committing.
    expect(swipeTarget(-71, WIDTH, 1, 3)).toBe(1);
    expect(swipeTarget(-73, WIDTH, 1, 3)).toBe(2);
  });

  it('scales the threshold with the container', () => {
    /*
      The gesture should ask for the same fraction of the carousel whatever it
      is being read on: 80px is a decisive swipe on a phone and a nudge on a
      wide desktop panel.
    */
    expect(swipeTarget(-80, 320, 0, 3)).toBe(1);
    expect(swipeTarget(-80, 1000, 0, 3)).toBe(0);
  });

  it('keeps a floor under the threshold on a narrow container', () => {
    // 18% of a small box is a few pixels, which is tap-wobble, not a swipe.
    expect(swipeTarget(-20, 100, 0, 3)).toBe(0);
  });

  it('wraps at both ends, the way the arrows do', () => {
    expect(swipeTarget(-120, WIDTH, 2, 3)).toBe(0);
    expect(swipeTarget(120, WIDTH, 0, 3)).toBe(2);
  });

  it('does nothing with a single reference', () => {
    // There is nothing to swipe to, and wrapping to itself would flicker.
    expect(swipeTarget(-300, WIDTH, 0, 1)).toBe(0);
  });

  it('survives a zero width', () => {
    // The frame has no width before layout; the floor is what covers it.
    expect(swipeTarget(-30, 0, 0, 3)).toBe(0);
    expect(swipeTarget(-300, 0, 0, 3)).toBe(1);
  });
});
