import type { EventPhase } from './challenge-events.service';
import type { ChallengeEntry } from './entities/challenge-entry.entity';

/**
 * How an entry is allowed to leave the server, by phase.
 *
 * This lives in its own file rather than beside the controller for one reason:
 * it is the blind vote. Everything else in the event flow is a convenience that
 * could be got wrong and merely annoy someone. If this leaks, the contest is not
 * blind and no part of the result means anything — so it is a unit with a test
 * against it rather than two helper functions at the bottom of a controller.
 */

/** The full reveal, once nothing about an entry can influence a vote. */
export function toEntry(entry: ChallengeEntry) {
  return {
    id: entry.id,
    userId: entry.userId,
    username: entry.user?.username ?? null,
    imageUrl: entry.imageUrl,
    workspacePhotoUrl: entry.workspacePhotoUrl,
    notes: entry.notes,
    voteCount: entry.voteCount,
    submittedAt: entry.submittedAt,
  };
}

/**
 * The blindfold shape, sent during the voting phase.
 *
 * Built by naming every field that may be sent, never by copying the entry and
 * removing things. That direction matters: a `delete`-based version stays
 * correct only for the columns that existed when it was written, so the day
 * someone adds `artistCountry` to the entity it ships into the blind payload
 * and nothing anywhere fails. Constructed this way, a new column is invisible
 * until a person decides to expose it.
 *
 * Only the id (to vote against) and the render (to judge) survive. The
 * workspace photo is withheld too — a Blender title bar or a recognisable
 * desktop is exactly the kind of tell blind voting exists to hide. `voteCount`
 * is zeroed rather than omitted so the field's type does not change shape
 * between phases and force the client to branch.
 */
export function toBlindEntry(entry: ChallengeEntry) {
  return {
    id: entry.id,
    userId: '',
    username: null,
    imageUrl: entry.imageUrl,
    workspacePhotoUrl: null,
    notes: null,
    voteCount: 0,
    submittedAt: entry.submittedAt,
  };
}

/**
 * What the viewer may see, decided by the phase.
 *
 * The single place that decision is made. Before this existed the controller
 * held a nested ternary, which is fine until a second caller needs the same
 * rule and reimplements four fifths of it.
 *
 *  - upcoming / open: nothing at all. Not anonymised — **absent**. While the
 *    window is open a late entrant could otherwise copy an early one, and the
 *    strongest version of that guarantee is having nothing to leak.
 *  - voting: the blind ballot.
 *  - finished / not-an-event: the full reveal.
 */
export function entriesForPhase(entries: ChallengeEntry[], phase: EventPhase) {
  if (phase === 'upcoming' || phase === 'open') return [];
  if (phase === 'voting') return entries.map(toBlindEntry);
  return entries.map(toEntry);
}
