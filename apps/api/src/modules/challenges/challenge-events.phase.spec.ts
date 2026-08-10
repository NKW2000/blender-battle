import { describe, expect, it } from 'vitest';

import { ChallengeEventsService, type EventPhase } from './challenge-events.service';
import type { Challenge } from './entities/challenge.entity';

/**
 * `phaseOf` decides, for every request touching a public challenge, whether you
 * may enter, whether you may vote, and whether anyone may see the entries. It
 * is a pure function of three timestamps, which makes it both the cheapest
 * thing in the codebase to test and the most expensive to get wrong: an
 * off-by-one opens submissions during voting, and the interface looks correct
 * the whole time.
 *
 * Constructed with `new` and no collaborators on purpose — the method touches
 * none of them, and going through Nest's container to prove that would be
 * slower and less obvious.
 */
const service = new ChallengeEventsService(
  null as never,
  null as never,
  null as never,
  null as never,
  null as never,
  null as never,
);

const OPENS = new Date('2026-03-01T12:00:00.000Z');
const CLOSES = new Date('2026-03-08T12:00:00.000Z');
const VOTING_CLOSES = new Date('2026-03-10T12:00:00.000Z');

function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    startDate: OPENS,
    endDate: CLOSES,
    votingEndsAt: VOTING_CLOSES,
    winnerEntryId: null,
    ...overrides,
  } as Challenge;
}

/** One millisecond either side — the boundary is the only interesting part. */
const just = (instant: Date, offsetMs: number) => new Date(instant.getTime() + offsetMs);

describe('phaseOf', () => {
  const cases: Array<[string, Date, EventPhase]> = [
    ['well before the start', new Date('2026-02-01T00:00:00.000Z'), 'upcoming'],
    ['one millisecond before opening', just(OPENS, -1), 'upcoming'],
    // Inclusive: the advertised opening time is a moment people are entering at.
    ['exactly at the opening instant', OPENS, 'open'],
    ['mid-window', new Date('2026-03-04T00:00:00.000Z'), 'open'],
    ['one millisecond before the deadline', just(CLOSES, -1), 'open'],
    // Exclusive: the deadline is when submissions *stop*, not a last free tick.
    ['exactly at the submission deadline', CLOSES, 'voting'],
    ['mid-voting', new Date('2026-03-09T00:00:00.000Z'), 'voting'],
    ['one millisecond before voting closes', just(VOTING_CLOSES, -1), 'voting'],
    ['exactly at the voting deadline', VOTING_CLOSES, 'finished'],
    ['long after everything', new Date('2027-01-01T00:00:00.000Z'), 'finished'],
  ];

  for (const [name, now, expected] of cases) {
    it(`is ${expected} ${name}`, () => {
      expect(service.phaseOf(challenge(), now)).toBe(expected);
    });
  }

  it('is not-an-event when the challenge was never scheduled', () => {
    // An ordinary catalogue brief. It must never be enterable or votable, and
    // the absence of dates is the only thing distinguishing it.
    expect(service.phaseOf(challenge({ startDate: null, endDate: null }), OPENS)).toBe(
      'not-an-event',
    );
  });

  it('is not-an-event when only one of the two dates is set', () => {
    // A half-scheduled event. Treating a missing end date as "open forever"
    // would be the worst possible reading.
    expect(service.phaseOf(challenge({ endDate: null }), just(OPENS, 1))).toBe('not-an-event');
    expect(service.phaseOf(challenge({ startDate: null }), just(OPENS, 1))).toBe('not-an-event');
  });

  it('is finished the moment a winner is frozen, whatever the clock says', () => {
    // A manager can close voting early. Once the result exists the event is
    // over, or a late vote could land against a frozen winner.
    const closed = challenge({ winnerEntryId: 'entry-1' });

    expect(service.phaseOf(closed, new Date('2026-03-09T00:00:00.000Z'))).toBe('finished');
  });

  it('finishes on the voting deadline even when nobody voted', () => {
    // No winner is ever frozen for an empty ballot, so without this clause the
    // event would sit in `voting` forever and stay open to a late vote.
    expect(service.phaseOf(challenge({ winnerEntryId: null }), just(VOTING_CLOSES, 1))).toBe(
      'finished',
    );
  });

  it('stays in voting when no voting deadline was ever set', () => {
    // Older events scheduled before the voting window existed. They need a
    // manager to close them, but they must not silently read as finished while
    // votes are still arriving.
    expect(
      service.phaseOf(challenge({ votingEndsAt: null }), new Date('2027-01-01T00:00:00.000Z')),
    ).toBe('voting');
  });

  it('does not depend on the process timezone', () => {
    /*
      The dates are absolute instants and the comparison is instant-to-instant,
      so the answer must not move when the server's local offset does. This is
      the specific bug that would follow from ever reintroducing a local-time
      comparison: the API runs in UTC and a developer machine does not, so it
      would pass locally and shift the deadline by hours in production.
    */
    const original = process.env.TZ;
    const answers = new Set<EventPhase>();

    try {
      for (const zone of ['UTC', 'Asia/Riyadh', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
        process.env.TZ = zone;
        answers.add(service.phaseOf(challenge(), just(CLOSES, -1)));
      }
    } finally {
      process.env.TZ = original;
    }

    expect([...answers]).toEqual(['open']);
  });
});
