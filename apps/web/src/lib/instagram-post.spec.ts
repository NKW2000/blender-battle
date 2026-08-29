import { Difficulty } from '@bb/shared';
import { describe, expect, it } from 'vitest';

import {
  DIFFICULTY_STYLE,
  POST_FORMATS,
  POST_KINDS,
  coverCrop,
  instagramPostHref,
  safeImageUrl,
  normalizeInstagramHandle,
  postFileName,
  wrapText,
} from './instagram-post';

/**
 * The post composer's arithmetic.
 *
 * jsdom has no 2D context, so the drawing itself cannot run here — which is
 * exactly why the geometry and the text wrapping are pure functions taking an
 * injected measurer. They are the parts most likely to be wrong, and they are
 * testable without a canvas.
 */

describe('the post formats', () => {
  it('offers the one shape Instagram actually wants', () => {
    /*
      4:5 at 1080x1350 — the tallest a feed post may be, and what the grid crops
      every other ratio down to. A second option would only be the same poster
      with less of the screen.
    */
    expect(Object.keys(POST_FORMATS)).toEqual(['portrait']);
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
    expect(postFileName('Anything', 'portrait')).not.toContain(':');
    expect(postFileName('Anything', 'portrait')).toBe('blenderbattle-anything-4x5.png');
  });

  it('survives punctuation and non-latin titles', () => {
    // A title is free text; it must never produce a filename the OS rejects.
    expect(postFileName('Hard-surface: bevels & panels!', 'portrait')).toBe(
      'blenderbattle-hard-surface-bevels-panels-4x5.png',
    );
    expect(postFileName('日本語', 'portrait')).toBe('blenderbattle-challenge-4x5.png');
  });

  it('falls back rather than producing a nameless file', () => {
    expect(postFileName('', 'portrait')).toBe('blenderbattle-challenge-4x5.png');
  });

  it('numbers the slides of a carousel, from one', () => {
    /*
      Uploaded in order, and a downloads folder sorts by name — so the order the
      operator sees has to be the order Instagram is handed. Unnumbered, the
      second file lands as "(1)" and sorts the same either way.
    */
    expect(postFileName('The couch', 'portrait', 'winner', 0, 2)).toBe(
      'blenderbattle-winner-the-couch-4x5-1of2.png',
    );
    expect(postFileName('The couch', 'portrait', 'winner', 1, 2)).toBe(
      'blenderbattle-winner-the-couch-4x5-2of2.png',
    );
  });

  it('leaves a single-slide post unnumbered', () => {
    expect(postFileName('The couch', 'portrait', 'challenge', 0, 1)).toBe(
      'blenderbattle-the-couch-4x5.png',
    );
  });

  it('names a winner post as one', () => {
    /*
      The announcement and the result for a challenge share a title, so without
      the kind in the name the second download lands as "(1)" beside the first.
    */
    expect(postFileName('The couch', 'portrait', 'winner')).toBe(
      'blenderbattle-winner-the-couch-4x5.png',
    );
    expect(postFileName('The couch', 'portrait', 'challenge')).toBe(
      'blenderbattle-the-couch-4x5.png',
    );
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

/* ------------------------------------------------------------- post kinds */

describe('the post kinds', () => {
  it('offers the announcement and the result', () => {
    expect(Object.keys(POST_KINDS)).toEqual(['challenge', 'winner']);
  });

  it('makes the result a carousel and the announcement a single image', () => {
    /*
      The result is two slides because the first withholds the answer and points
      right; an announcement has nothing to withhold.
    */
    expect(POST_KINDS.challenge.slides).toBe(1);
    expect(POST_KINDS.winner.slides).toBe(2);
  });

  it('gives each kind its own marquee', () => {
    // The strip across the top is the only thing that tells the two apart at a
    // glance in a feed, so they must not share a word.
    expect(POST_KINDS.challenge.marquee).not.toBe(POST_KINDS.winner.marquee);
  });
});

describe('normalising an Instagram handle', () => {
  it('takes a plain handle unchanged', () => {
    expect(normalizeInstagramHandle('blenderguru')).toBe('blenderguru');
  });

  it('drops a leading @', () => {
    expect(normalizeInstagramHandle('@blenderguru')).toBe('blenderguru');
  });

  it('pulls the handle out of a pasted profile URL', () => {
    /*
      The likeliest input by far: an admin copies the winner's profile from the
      address bar. Crediting someone as "@https://instagram.com/x/" is worse
      than crediting nobody.
    */
    expect(normalizeInstagramHandle('https://www.instagram.com/blenderguru/')).toBe('blenderguru');
    expect(normalizeInstagramHandle('instagram.com/blenderguru?hl=en')).toBe('blenderguru');
  });

  it('keeps the dots and underscores a real handle may contain', () => {
    expect(normalizeInstagramHandle('the_blender.guy')).toBe('the_blender.guy');
  });

  it('strips whitespace and characters Instagram does not allow', () => {
    expect(normalizeInstagramHandle('  blender guru!  ')).toBe('blenderguru');
  });

  it('lowercases, because handles are not case sensitive', () => {
    expect(normalizeInstagramHandle('BlenderGuru')).toBe('blenderguru');
  });

  it("holds to Instagram's thirty character limit", () => {
    expect(normalizeInstagramHandle('a'.repeat(50))).toHaveLength(30);
  });

  it('returns nothing for input with no handle in it', () => {
    // The credit line is skipped entirely rather than drawing a bare "@".
    expect(normalizeInstagramHandle('   ')).toBe('');
    expect(normalizeInstagramHandle('@@@')).toBe('');
  });
});

/* ------------------------------------------------------- the prefilled link */

const query = (href: string) => new URLSearchParams(href.split('?')[1]);

describe('linking to the composer with a post filled in', () => {
  it('points at the composer and names the kind', () => {
    const href = instagramPostHref({ kind: 'winner' });

    expect(href.startsWith('/admin/instagram?')).toBe(true);
    expect(query(href).get('kind')).toBe('winner');
  });

  it('carries everything the winner post needs', () => {
    const params = query(
      instagramPostHref({
        kind: 'winner',
        title: 'The couch',
        difficulty: Difficulty.HARD,
        username: 'renderRat',
        votes: 42,
        imageUrl: 'https://res.cloudinary.com/x/entry.png',
      }),
    );

    expect(params.get('title')).toBe('The couch');
    expect(params.get('difficulty')).toBe(Difficulty.HARD);
    expect(params.get('username')).toBe('renderRat');
    expect(params.get('votes')).toBe('42');
    expect(params.get('image')).toBe('https://res.cloudinary.com/x/entry.png');
  });

  it('carries the challenge photo separately from the winning render', () => {
    /*
      Two different pictures doing two different jobs: one names the challenge
      on the tease slide, the other is the answer held back for slide two. A
      single parameter would put the render on the slide that exists to withhold
      it.
    */
    const params = query(
      instagramPostHref({
        kind: 'winner',
        imageUrl: 'https://cdn.test/entry.png',
        referenceUrl: 'https://cdn.test/brief.png',
      }),
    );

    expect(params.get('image')).toBe('https://cdn.test/entry.png');
    expect(params.get('reference')).toBe('https://cdn.test/brief.png');
  });

  it('leaves absent values out rather than sending "null"', () => {
    /*
      The parameters come from records with nullable columns — a challenge with
      no cover, a winner with no avatar. A literal "null" would be read back as
      a title, or fetched as an image URL.
    */
    const params = query(
      instagramPostHref({
        kind: 'challenge',
        title: null,
        blurb: undefined,
        imageUrl: null,
        referenceUrl: null,
      }),
    );

    expect(params.has('title')).toBe(false);
    expect(params.has('blurb')).toBe(false);
    expect(params.has('image')).toBe(false);
    expect(params.has('reference')).toBe(false);
  });

  it('keeps a tally of zero', () => {
    // Zero votes is a real result and reads differently from no tally at all.
    expect(query(instagramPostHref({ kind: 'winner', votes: 0 })).get('votes')).toBe('0');
  });

  it('omits a tally that was never counted', () => {
    expect(query(instagramPostHref({ kind: 'winner', votes: null })).has('votes')).toBe(false);
  });

  it('escapes text that would otherwise break the query', () => {
    // Titles are free text and routinely contain both.
    const params = query(instagramPostHref({ kind: 'challenge', title: 'Bevels & panels?' }));

    expect(params.get('title')).toBe('Bevels & panels?');
  });
});

describe('accepting an image URL from a link', () => {
  it('takes an https URL', () => {
    expect(safeImageUrl('https://res.cloudinary.com/x/a.png')).toBe('https://res.cloudinary.com/x/a.png');
  });

  it('refuses a javascript: URL', () => {
    /*
      The parameters come from the address bar, and the value is handed to an
      `<img src>` on a page only an administrator can open. A scheme check is
      the cheap half of not caring what anyone puts there.
    */
    expect(safeImageUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('refuses a data: payload', () => {
    expect(safeImageUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeUndefined();
  });

  it('refuses plain http', () => {
    // Mixed content the browser would block anyway; better to say so than to
    // show an operator a post with a silently missing image.
    expect(safeImageUrl('http://example.test/a.png')).toBeUndefined();
  });

  it('refuses something that is not a URL at all', () => {
    expect(safeImageUrl('not a url')).toBeUndefined();
    expect(safeImageUrl('')).toBeUndefined();
    expect(safeImageUrl(undefined)).toBeUndefined();
    expect(safeImageUrl(null)).toBeUndefined();
  });
});
