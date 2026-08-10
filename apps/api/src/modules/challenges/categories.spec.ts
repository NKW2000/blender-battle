import { ACTIVE_CATEGORY_SLUGS } from '@bb/shared';
import { describe, expect, it } from 'vitest';

/**
 * Which disciplines the application offers.
 *
 * The database still holds fourteen category rows and a migration exists to
 * delete thirteen of them, but the behaviour deliberately does not depend on
 * that migration having been run: a migration fixes the one database it is run
 * against, whereas this decides what every deployment offers from the moment it
 * boots. That distinction is the whole reason the constant exists, and it is
 * exactly the kind of thing that gets "simplified" back into a plain
 * `categories.find()` by someone who sees a filter and assumes it is redundant.
 *
 * So this asserts the promise rather than the query: one discipline, and it is
 * Modeling. If a second is ever added it should be added here first — the test
 * failing is the reminder that pickers, filters and the draw all widen with it.
 */
describe('the offered disciplines', () => {
  it('is Modeling, and only Modeling', () => {
    expect([...ACTIVE_CATEGORY_SLUGS]).toEqual(['modeling']);
  });

  it('never contains a slug the seed does not define', () => {
    /*
      The seed's slugs, verbatim. A typo here is silent in the worst way: the
      filter matches nothing, `listCategories` returns an empty array, and every
      picker in the application renders zero options while looking like it
      loaded fine.
    */
    const seeded = [
      'modeling',
      'sculpting',
      'animation',
      'rigging',
      'lighting',
      'materials',
      'texturing',
      'geometry-nodes',
      'environment',
      'hard-surface',
      'character',
      'product-visualization',
      'vfx',
      'rendering',
    ];

    for (const slug of ACTIVE_CATEGORY_SLUGS) {
      expect(seeded).toContain(slug);
    }
  });

  it('is not empty', () => {
    // An empty list would leave a required field with no valid answer, so no
    // challenge could be authored at all.
    expect(ACTIVE_CATEGORY_SLUGS.length).toBeGreaterThan(0);
  });
});
