import { Difficulty } from '@bb/shared';
import { describe, expect, it } from 'vitest';

import { DIFFICULTY_STYLE, POST_FORMATS, coverCrop, postFileName, wrapText } from './instagram-post';

/**
 * The post composer's arithmetic.
 *
 * jsdom has no 2D context, so the drawing itself cannot run here — which is
 * exactly why the geometry and the text wrapping are pure functions taking an
 * injected measurer. They are the parts most likely to be wrong, and they are
 * testable without a canvas.
 */

describe('the post formats', () => {
  it('offers only the two shapes Instagram gives a feed post', () => {
    /*
      Square and 4:5. Anything else is cropped by Instagram, so offering it
      would be offering a worse version of one of these two.
    */
    expect(Object.keys(POST_FORMATS)).toEqual(['square', 'portrait']);
    expect(POST_FORMATS.square).toMatchObject({ width: 1080, height: 1080, ratio: '1:1' });
    expect(POST_FORMATS.portrait).toMatchObject({ width: 1080, height: 1350, ratio: '4:5' });
  });

  it('exports at the resolution Instagram actually wants', () => {
    // 1080 wide is the point at which Instagram stops re-compressing.
    for (const format of Object.values(POST_FORMATS)) {
      expect(format.width).toBe(1080);
    }
  });
});

describe('cover cropping the reference', () => {
  it('trims the sides of an image wider than the frame', () => {
    // A 2000x1000 photo into a square keeps its full height and loses width.
    const crop = coverCrop(2000, 1000, 500, 500);

    expect(crop).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 });
  });

  it('trims the top and bottom of an image taller than the frame', () => {
    const crop = coverCrop(1000, 2000, 500, 500);

    expect(crop).toEqual({ sx: 0, sy: 500, sw: 1000, sh: 1000 });
  });

  it('takes the whole of an image that already matches', () => {
    const crop = coverCrop(800, 800, 400, 400);

    expect(crop).toEqual({ sx: 0, sy: 0, sw: 800, sh: 800 });
  });

  it('always centres what it keeps', () => {
    /*
      The subject of a reference photo is almost always central, and an
      off-centre crop is the difference between a usable post and one that cuts
      the model in half.
    */
    const crop = coverCrop(3000, 1000, 100, 100);

    expect(crop.sx).toBe((3000 - 1000) / 2);
  });
});

describe('wrapping the title', () => {
  // Ten units per character, so widths are easy to reason about.
  const measure = (s: string) => s.length * 10;

  it('keeps a short line on one line', () => {
    expect(wrapText('The couch', 1000, measure)).toEqual(['The couch']);
  });

  it('breaks at a space rather than mid-word', () => {
    const lines = wrapText('Build a lamp that lights a room', 100, measure);

    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(100);
    expect(lines.join(' ')).toBe('Build a lamp that lights a room');
  });

  it('never drops a word', () => {
    // The failure that matters: a title silently losing its last word.
    const text = 'A hard surface prop with sharp bevels';
    const lines = wrapText(text, 90, measure);

    expect(lines.join(' ').split(/\s+/)).toEqual(text.split(/\s+/));
  });

  it('gives a word too long to fit its own line rather than looping', () => {
    const lines = wrapText('supercalifragilistic', 50, measure);

    expect(lines).toEqual(['supercalifragilistic']);
  });

  it('returns nothing for empty input', () => {
    expect(wrapText('   ', 100, measure)).toEqual([]);
  });

  it('collapses runs of whitespace', () => {
    expect(wrapText('The    couch', 1000, measure)).toEqual(['The couch']);
  });
});

describe('the download filename', () => {
  it('slugs the title and names the shape', () => {
    expect(postFileName('The couch', 'portrait')).toBe('blenderbattle-the-couch-4x5.png');
  });

  it('uses a colon-free ratio, because a colon is not legal in a filename', () => {
    expect(postFileName('Anything', 'square')).not.toContain(':');
    expect(postFileName('Anything', 'square')).toBe('blenderbattle-anything-1x1.png');
  });

  it('survives punctuation and non-latin titles', () => {
    // A title is free text; it must never produce a filename the OS rejects.
    expect(postFileName('Hard-surface: bevels & panels!', 'square')).toBe(
      'blenderbattle-hard-surface-bevels-panels-1x1.png',
    );
    expect(postFileName('日本語', 'square')).toBe('blenderbattle-challenge-1x1.png');
  });

  it('falls back rather than producing a nameless file', () => {
    expect(postFileName('', 'square')).toBe('blenderbattle-challenge-1x1.png');
  });
});

describe('difficulty styling', () => {
  it('keeps the colour each difficulty has everywhere else in the product', () => {
    // A post that coloured HARD green would teach the audience the wrong thing.
    expect(DIFFICULTY_STYLE[Difficulty.EASY].fill).toBe('#5ef2a8');
    expect(DIFFICULTY_STYLE[Difficulty.MEDIUM].fill).toBe('#ffd23f');
    expect(DIFFICULTY_STYLE[Difficulty.HARD].fill).toBe('#ff3d9a');
  });

  it('covers every difficulty the product defines', () => {
    for (const value of Object.values(Difficulty)) {
      expect(DIFFICULTY_STYLE[value]).toBeDefined();
    }
  });
});
