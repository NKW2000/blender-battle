import { getMetadataArgsStorage } from 'typeorm';
import { describe, expect, it } from 'vitest';

import { entriesForPhase, toBlindEntry, toEntry } from './challenge-entries.mapper';
import { ChallengeEntry } from './entities/challenge-entry.entity';

/**
 * The blind vote is the product. If an entry's author leaks during voting the
 * contest is a popularity contest, the result means nothing, and — this is the
 * part that makes tests the only instrument that works here — **the application
 * looks exactly the same**. Nobody using the site would notice. So this file
 * asserts on the shape that actually goes over the wire.
 */

function entry(overrides: Partial<ChallengeEntry> = {}): ChallengeEntry {
  return {
    id: 'entry-1',
    challengeId: 'challenge-1',
    userId: 'user-1',
    user: { username: 'ada' },
    imageUrl: 'https://cdn.test/render.png',
    workspacePhotoUrl: 'https://cdn.test/workspace.png',
    notes: 'used a subsurf',
    submittedAt: new Date('2026-01-01T00:00:00.000Z'),
    voteCount: 7,
    isHidden: false,
    ...overrides,
  } as unknown as ChallengeEntry;
}

/**
 * Serialise the way the HTTP layer does.
 *
 * Asserting on the mapper's return value would miss the failure mode that
 * matters: a getter, a `toJSON`, or a lazily-loaded relation that produces
 * nothing in a direct property read but appears once the object is stringified.
 * The response body is the boundary, so the response body is what is checked.
 */
const overTheWire = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('entriesForPhase', () => {
  it('sends nothing at all before voting opens', () => {
    // Not anonymised — absent. A late entrant must not be able to see an early
    // entry while the window is still open, and nothing is the strongest
    // version of that.
    expect(entriesForPhase([entry()], 'upcoming')).toEqual([]);
    expect(entriesForPhase([entry()], 'open')).toEqual([]);
  });

  it('reveals authors and tallies once the result is frozen', () => {
    const [revealed] = overTheWire(entriesForPhase([entry()], 'finished'));

    expect(revealed.username).toBe('ada');
    expect(revealed.userId).toBe('user-1');
    expect(revealed.voteCount).toBe(7);
    expect(revealed.workspacePhotoUrl).toBe('https://cdn.test/workspace.png');
  });
});

describe('toBlindEntry', () => {
  const blind = overTheWire(toBlindEntry(entry()));

  it('keeps only what a voter needs to judge and to vote', () => {
    expect(blind.id).toBe('entry-1');
    expect(blind.imageUrl).toBe('https://cdn.test/render.png');
  });

  it('carries no identifying value anywhere in the payload', () => {
    // A field-by-field assertion would pass while a leak sat in a field nobody
    // thought to name. Searching the serialised body catches it wherever it is.
    const body = JSON.stringify(blind);

    expect(body).not.toContain('ada');
    expect(body).not.toContain('user-1');
    expect(body).not.toContain('workspace.png');
    expect(body).not.toContain('subsurf');
  });

  it('hides the running tally', () => {
    // A visible tally lets voters pile onto the leader, which is the same
    // failure as revealing the author by a slower route.
    expect(blind.voteCount).toBe(0);
  });

  it('keeps the field set identical to the revealed shape', () => {
    // Same keys in both phases, so the client never branches on which fields
    // exist — only on their values. A missing key is how "undefined" ends up
    // rendered as an author name.
    expect(Object.keys(blind).sort()).toEqual(Object.keys(overTheWire(toEntry(entry()))).sort());
  });
});

/**
 * The regression this file exists for.
 *
 * `toBlindEntry` names the fields it emits, so a new column cannot leak
 * *through* it. What a new column can do is arrive with nobody thinking about
 * voting at all — `artistCountry`, `deviceFingerprint`, `discordId` — and get
 * added to `toEntry` for the reveal, which is reasonable, while no one asks
 * whether it also has to be withheld during the ballot.
 *
 * So every column is classified here. Add one to the entity and this test fails
 * until a person has decided which list it belongs in. That decision is the
 * whole point; the test just refuses to let it be skipped.
 */
describe('the blind contract covers every column', () => {
  /** Safe during voting: needed to judge the work or to cast the vote. */
  const EXPOSED_WHILE_BLIND = ['id', 'imageUrl', 'submittedAt'];

  /** Withheld during voting: identifies the artist, or reveals the standings. */
  const WITHHELD_WHILE_BLIND = [
    'userId',
    'user',
    'username',
    'workspacePhotoUrl',
    'notes',
    'voteCount',
  ];

  /** Never leaves the server in any phase. */
  const INTERNAL = ['challengeId', 'challenge', 'isHidden', 'createdAt', 'updatedAt', 'deletedAt'];

  it('classifies every property the entity declares', () => {
    // Read from TypeORM's decorator storage rather than a hand-kept list: the
    // point is to notice columns nobody told this file about.
    const declared = getMetadataArgsStorage()
      .filterColumns(ChallengeEntry)
      .map((column) => column.propertyName);
    const relations = getMetadataArgsStorage()
      .filterRelations(ChallengeEntry)
      .map((relation) => relation.propertyName);

    const classified = new Set([...EXPOSED_WHILE_BLIND, ...WITHHELD_WHILE_BLIND, ...INTERNAL]);
    const unclassified = [...declared, ...relations].filter((name) => !classified.has(name));

    expect(unclassified).toEqual([]);
  });

  it('emits every exposed field and no withheld one', () => {
    const blind = overTheWire(toBlindEntry(entry()));
    const source = entry();

    for (const field of EXPOSED_WHILE_BLIND) {
      expect(blind[field]).toEqual(overTheWire(source[field as keyof ChallengeEntry]));
    }

    for (const field of WITHHELD_WHILE_BLIND) {
      const real = source[field as keyof ChallengeEntry];
      // `username` lives on the joined user, not on the entry itself, and the
      // legacy model columns are null on a modern entry. Neither has a real
      // value here to leak, and the payload-wide search above already covers
      // the ones that do.
      if (!(field in blind) || real === undefined || real === null) continue;

      // Present-but-neutralised is fine (`voteCount: 0`, `userId: ''`); what is
      // not fine is the real value surviving.
      expect(blind[field]).not.toEqual(overTheWire(real));
    }
  });
});
