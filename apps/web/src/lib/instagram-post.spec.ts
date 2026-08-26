import { Difficulty } from '@bb/shared';
import { describe, expect, it } from 'vitest';

import {
  DIFFICULTY_STYLE,
  POST_FORMATS,
  containBox,
  coverCrop,
  knockOutBackground,
  postFileName,
  wrapText,
} from './instagram-post';

/*
  jsdom has no `ImageData`.

  It is a browser API and the knock-out is right to use it, so the shim lives
  here rather than the production code being bent around a test environment.
*/
if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataShim {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    readonly colorSpace = 'srgb' as const;

    constructor(data: Uint8ClampedArray, width: number, height?: number) {
      this.data = data;
      this.width = width;
      this.height = height ?? data.length / 4 / width;
    }
  }

  globalThis.ImageData = ImageDataShim as unknown as typeof ImageData;
}

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

/* ------------------------------------------------- background knock-out */

/** Builds an ImageData by hand — jsdom has no canvas to get one from. */
function makeImage(width: number, height: number, paint: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

const alphaAt = (image: ImageData, x: number, y: number) => image.data[(y * image.width + x) * 4 + 3]!;

describe('knocking the backdrop out of a reference', () => {
  /*
    A grey plate with a solid block in the middle — the shape of almost every
    Blender render that will be dropped into this tool.
  */
  const render = () =>
    makeImage(20, 20, (x, y) => (x >= 7 && x <= 12 && y >= 7 && y <= 12 ? [200, 40, 40] : [128, 128, 128]));

  it('clears the backdrop', () => {
    const out = knockOutBackground(render(), 20);

    expect(alphaAt(out, 0, 0)).toBe(0);
    expect(alphaAt(out, 19, 19)).toBe(0);
  });

  it('leaves the subject fully opaque', () => {
    const out = knockOutBackground(render(), 20);

    expect(alphaAt(out, 10, 10)).toBe(255);
  });

  it('keeps subject pixels that happen to match the backdrop', () => {
    /*
      The reason this floods from the edges instead of testing every pixel
      against the backdrop colour. A grey detail *inside* the subject — an eye,
      a screw, a shadow — is the same colour as the plate, and a global pass
      would punch a hole straight through it.
    */
    const withGreyDetail = makeImage(20, 20, (x, y) => {
      const inSubject = x >= 6 && x <= 13 && y >= 6 && y <= 13;
      if (!inSubject) return [128, 128, 128];
      const isDetail = x >= 9 && x <= 10 && y >= 9 && y <= 10;
      return isDetail ? [128, 128, 128] : [200, 40, 40];
    });

    const out = knockOutBackground(withGreyDetail, 20);

    expect(alphaAt(out, 9, 9)).toBe(255);
  });

  it('does not touch a backdrop outside the tolerance', () => {
    // A busy photographic background must be left alone rather than half-eaten.
    const noisy = makeImage(20, 20, (x, y) => [(x * 37) % 255, (y * 91) % 255, ((x + y) * 53) % 255]);
    const out = knockOutBackground(noisy, 4);

    let cleared = 0;
    for (let i = 3; i < out.data.length; i += 4) if (out.data[i] === 0) cleared += 1;

    expect(cleared).toBeLessThan(20 * 20 * 0.25);
  });

  it('does not overflow the stack on a large image', () => {
    // A recursive fill dies here; the explicit stack is why this passes.
    const big = makeImage(400, 400, () => [128, 128, 128]);

    expect(() => knockOutBackground(big, 20)).not.toThrow();
  });

  it('leaves the original untouched', () => {
    /*
      Each pass runs from the untouched source, so the caller can move the
      tolerance without the cut eating further into the subject every time.
    */
    const source = render();
    const before = source.data[3];

    knockOutBackground(source, 20);

    expect(source.data[3]).toBe(before);
  });
});

describe('containing a cut-out subject', () => {
  it('fits the whole subject rather than cropping it', () => {
    // A knocked-out subject must never be cropped — that is the opposite of the
    // floating look the transparency exists to produce.
    const box = containBox(2000, 1000, 500, 500);

    expect(box.width).toBe(500);
    expect(box.height).toBe(250);
  });

  it('centres what it fits', () => {
    const box = containBox(1000, 2000, 500, 500);

    expect(box.offsetX).toBe(125);
    expect(box.offsetY).toBe(0);
  });

  it('never scales a small subject past the box', () => {
    const box = containBox(100, 100, 500, 400);

    expect(box.width).toBeLessThanOrEqual(500);
    expect(box.height).toBeLessThanOrEqual(400);
  });
});
