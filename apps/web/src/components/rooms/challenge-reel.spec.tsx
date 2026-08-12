import { Difficulty } from '@bb/shared';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { RoomDetail } from '@/features/rooms/use-rooms';

/**
 * The draw reel.
 *
 * It is theatre over a decision already made: the server picks the brief when
 * the host starts the room and reveals it as the status leaves the lobby, so
 * this only presents it. The property that matters is therefore not "does it
 * animate" but "does it always end on the brief the server chose" — a reel that
 * landed anywhere else would be telling every player in the room the wrong
 * thing about what they are about to model.
 */

const pool = {
  pages: [
    {
      items: [
        { id: 'a', title: 'The couch' },
        { id: 'b', title: 'Horn' },
        { id: 'c', title: 'A lamp' },
      ],
    },
  ],
};

let challenges: unknown = pool;

vi.mock('@/features/challenges/use-challenges', () => ({
  useChallenges: () => ({ data: challenges }),
}));

// jsdom has no AudioContext, and the click is not what is under test.
vi.mock('@/features/sound/use-sound', () => ({ useSound: () => () => undefined }));

const { ChallengeReel } = await import('./challenge-reel');

function makeRoom(overrides: Partial<RoomDetail> = {}): RoomDetail {
  return {
    difficulty: Difficulty.EASY,
    challenge: { title: 'Horn' },
    ...overrides,
  } as RoomDetail;
}

describe('the draw reel', () => {
  it('ends on the brief the server drew', async () => {
    render(<ChallengeReel room={makeRoom()} />);

    const rows = screen.getAllByText(/couch|horn|lamp|—/i);
    // The last row is where the strip stops, so it is the one that has to be
    // the winner. Everything before it is scenery.
    expect(rows[rows.length - 1]).toHaveTextContent('Horn');
  });

  it('shows other real briefs from the pool alongside it', () => {
    // Invented names would be a lie about what this room could have drawn.
    render(<ChallengeReel room={makeRoom()} />);

    expect(screen.getAllByText('The couch').length).toBeGreaterThan(0);
    expect(screen.getAllByText('A lamp').length).toBeGreaterThan(0);
  });

  it('does not repeat the winner among the scenery', () => {
    /*
      The strip is filtered before the winner is appended. Without that the
      drawn brief could flash past mid-spin and land again, which reads as the
      reel having stopped early and restarted.
    */
    render(<ChallengeReel room={makeRoom()} />);

    expect(screen.getAllByText('Horn')).toHaveLength(1);
  });

  it('still runs when the catalogue has not loaded', async () => {
    // A draw that silently did nothing would be worse than a short one.
    challenges = undefined;
    render(<ChallengeReel room={makeRoom({ challenge: { title: 'Horn' } as never })} />);

    const rows = screen.getAllByText(/horn|—/i);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[rows.length - 1]).toHaveTextContent('Horn');

    challenges = pool;
  });

  it('announces the result once it lands', async () => {
    /*
      `act` around the clock, not `waitFor`.

      `waitFor` polls on real timers, so under fake ones it waits for a tick
      that will never come and the test dies at its own timeout rather than at
      an assertion. Advancing inside `act` flushes the state update the timeout
      schedules, which is the whole thing being checked.
    */
    vi.useFakeTimers();
    try {
      render(<ChallengeReel room={makeRoom()} />);
      expect(screen.getByText(/picking from the catalogue/i)).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      expect(screen.getByText(/that is the one/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('copes with a room whose challenge has not arrived yet', () => {
    // A brief render between the status changing and the payload carrying the
    // challenge must not blank the screen.
    render(<ChallengeReel room={makeRoom({ challenge: null })} />);

    expect(screen.getByText('Your brief')).toBeInTheDocument();
  });
});
