import { ApiErrorCode } from '@bb/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ChallengeEventsService } from './challenge-events.service';
import type { Challenge } from './entities/challenge.entity';

/**
 * Who is allowed to vote in a public challenge.
 *
 * Registration is free and unverified, so "one vote per account" is only worth
 * as much as an account costs. Requiring the voter to have entered raises that
 * from an email address to a finished render plus a workspace screenshot — and
 * unlike a captcha or a reputation score, it costs nothing to run and is the
 * same rule rooms already enforce.
 */

/**
 * `vote` derives the phase from the clock, so the clock is pinned inside the
 * voting window. Fixed dates alone would not do it: the suite would pass until
 * the real date drifted past the window and then start failing for a reason
 * that has nothing to do with the code.
 */
const DURING_VOTING = new Date('2026-03-09T00:00:00.000Z');

function createService(options: {
  voterHasEntry?: boolean;
  targetOwnerId?: string;
  alreadyVoted?: boolean;
  voterVerified?: boolean;
  /** Lets a case exercise the flag being off, not just its enforcement. */
  requireVerified?: boolean;
} = {}) {
  const challenge = {
    id: 'challenge-1',
    startDate: new Date('2026-03-01T00:00:00.000Z'),
    endDate: new Date('2026-03-08T00:00:00.000Z'),
    votingEndsAt: new Date('2026-03-10T00:00:00.000Z'),
    winnerEntryId: null,
  } as Challenge;

  const target = {
    id: 'entry-2',
    challengeId: 'challenge-1',
    userId: options.targetOwnerId ?? 'someone-else',
    isHidden: false,
  };

  const inserted: unknown[] = [];

  const service = new ChallengeEventsService(
    { findOne: async () => challenge } as never,
    {
      findOne: async (query: { where: Record<string, unknown> }) => {
        // Two different lookups share this repository: "does the voter have an
        // entry" (by challenge + user) and "what is being voted for" (by id).
        if ('userId' in query.where) return options.voterHasEntry === false ? null : { id: 'entry-1' };
        return target;
      },
      count: async () => 1,
      find: async () => [target],
    } as never,
    {
      findOne: async () => (options.alreadyVoted ? { id: 'vote-1' } : null),
    } as never,
    {
      // The voter's own account, for the email-verification gate.
      findOne: async () => ({
        id: 'voter-1',
        emailVerifiedAt: options.voterVerified === false ? null : new Date(),
      }),
    } as never,
    {
      transaction: async (work: (m: unknown) => Promise<void>) =>
        work({
          insert: async (_entity: unknown, values: unknown) => {
            inserted.push(values);
          },
          increment: async () => ({ affected: 1 }),
        }),
    } as never,
    { createMany: async () => undefined } as never,
    /*
      The verification gate is behind `REQUIRE_VERIFIED_EMAIL_TO_VOTE`, and this
      spec is what documents its behaviour — so it is asserted here with the
      flag deliberately on, whatever the deployment currently runs with. A test
      that only checked the default would go quiet the moment the default
      changed, which is the opposite of what it is for.
    */
    { requireVerifiedEmailToVote: options.requireVerified ?? true } as never,
  );

  return { service, challenge, inserted };
}

describe('vote — who may cast one', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(DURING_VOTING);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('accepts a vote from someone who entered', async () => {
    const { service, inserted } = createService({ voterHasEntry: true });

    await expect(service.vote('challenge-1', 'voter-1', 'entry-2')).resolves.toEqual({
      entryId: 'entry-2',
    });
    expect(inserted).toHaveLength(1);
  });

  it('refuses a vote from an unconfirmed address', async () => {
    /*
      Verification is enforced at this one action and nowhere else. An
      unverified account may browse, enter and be judged — it just cannot
      decide who wins, which is the only point where an anonymous inbox turns
      into influence over somebody else's result.
    */
    const { service, inserted } = createService({ voterHasEntry: true, voterVerified: false });

    await expect(service.vote('challenge-1', 'voter-1', 'entry-2')).rejects.toMatchObject({
      code: ApiErrorCode.FORBIDDEN,
    });
    expect(inserted).toHaveLength(0);
  });

  it('lets an unverified entrant vote when the gate is switched off', async () => {
    /*
      The state this deployment currently runs in.

      A gate is only a gate if the confirmation email can arrive. With no
      working mail driver, enforcing it does not stop sockpuppets — nobody can
      verify, so it stops everybody, and the ballot refuses an account that
      looks perfectly normal. Entrants-only remains the defence that is actually
      load-bearing, and it is unaffected.
    */
    const { service, inserted } = createService({
      voterHasEntry: true,
      voterVerified: false,
      requireVerified: false,
    });

    await expect(service.vote('challenge-1', 'voter-1', 'entry-2')).resolves.toBeDefined();
    expect(inserted).toHaveLength(1);
  });

  it('still refuses a vote from someone who did not enter, gate or no gate', async () => {
    // The one that matters most: turning the email gate off must not weaken the
    // rule that only entrants decide the result.
    const { service, inserted } = createService({
      voterHasEntry: false,
      voterVerified: false,
      requireVerified: false,
    });

    await expect(service.vote('challenge-1', 'voter-1', 'entry-2')).rejects.toMatchObject({
      code: ApiErrorCode.FORBIDDEN,
    });
    expect(inserted).toHaveLength(0);
  });

  it('refuses a vote from someone who did not enter', async () => {
    /*
      The sockpuppet path. Ten free accounts, ten votes, winner decided by
      whoever owns the most inboxes — and nothing else in the system can tell
      those accounts apart from ten real artists.
    */
    const { service, inserted } = createService({ voterHasEntry: false });

    await expect(service.vote('challenge-1', 'voter-1', 'entry-2')).rejects.toMatchObject({
      code: ApiErrorCode.FORBIDDEN,
    });
    expect(inserted).toHaveLength(0);
  });

  it('still refuses a vote for your own entry', async () => {
    // Entering is now a prerequisite for voting, which makes every voter the
    // owner of some entry — so the self-vote guard matters more than before,
    // not less.
    const { service } = createService({ voterHasEntry: true, targetOwnerId: 'voter-1' });

    await expect(service.vote('challenge-1', 'voter-1', 'entry-2')).rejects.toMatchObject({
      code: ApiErrorCode.FORBIDDEN,
    });
  });

  it('still refuses a second vote', async () => {
    const { service } = createService({ voterHasEntry: true, alreadyVoted: true });

    await expect(service.vote('challenge-1', 'voter-1', 'entry-2')).rejects.toMatchObject({
      code: ApiErrorCode.CONFLICT,
    });
  });

  it('checks entry before it checks the target, so a prober learns nothing', async () => {
    // A non-entrant guessing entry ids gets the same 403 whether or not the id
    // exists, rather than a 404 that confirms it.
    const { service } = createService({ voterHasEntry: false });

    await expect(service.vote('challenge-1', 'voter-1', 'no-such-entry')).rejects.toMatchObject({
      code: ApiErrorCode.FORBIDDEN,
    });
  });
});
