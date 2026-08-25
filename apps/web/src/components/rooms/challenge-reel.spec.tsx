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
  it('puts the drawn brief where the reel stops', () => {
    /*
      The landing index is `(REPS - 1) * pool + floor(pool / 2)` — inside the
      last repetition, with reel still visible to the right of the marker. The
      card written there is what ends up framed, so it has to be the server's
      pick and nothing else.
    */
    render(<ChallengeReel room={makeRoom()} />);

    const cards = screen.getAllByText(/couch|horn|lamp/i);
    const pool = 2; // The couch and A lamp — the winner is filtered out of the scenery.
    const landing = (6 - 1) * pool + Math.floor(pool / 2);

    expect(cards[landing]).toHaveTextContent('Horn');
  });

  it('shows other real briefs from the pool alongside it', () => {
    // Invented names would be a lie about what this room could have drawn.
    render(<ChallengeReel room={makeRoom()} />);

    expect(screen.getAllByText('The couch').length).toBeGreaterThan(0);
    expect(screen.getAllByText('A lamp').length).toBeGreaterThan(0);
  });

  it('does not repeat the winner among the scenery', () => {
    /*
      The pool is filtered before the winner is written into the landing slot.
      Without that the drawn brief flashes past mid-spin and lands again, which
      reads as the reel having stopped early and restarted.
    */
    render(<ChallengeReel room={makeRoom()} />);

    expect(screen.getAllByText('Horn')).toHaveLength(1);
  });

  it('still runs when the catalogue has not loaded', async () => {
    // A draw that silently did nothing would be worse than a short one.
    challenges = undefined;
    render(<ChallengeReel room={makeRoom({ challenge: { title: 'Horn' } as never })} />);

    // With nothing else to show, the winner is its own scenery — every card is
    // the same, and the spin still runs rather than the screen sitting empty.
    const cards = screen.getAllByText('Horn');
    expect(cards.length).toBeGreaterThan(1);

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
      expect(screen.getByText(/slicing through the deck/i)).toBeInTheDocument();

      await act(async () => {
        // Past REVEAL_MS (4700), which is when the machine announces itself.
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(screen.getByText(/locked in/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips the spin entirely when reduced motion is asked for', () => {
    /*
      Someone who has asked for less movement is not asking to be told the
      result more slowly. A four-second horizontal slide is exactly the motion
      that setting exists to suppress, so the reel jumps to the answer — and
      because it is already there, the result is announced immediately rather
      than after a spin nobody is watching.
    */
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });

    try {
      render(<ChallengeReel room={makeRoom()} />);

      // No timers advanced: it is already announced.
      expect(screen.getByText(/locked in/i)).toBeInTheDocument();
      expect(screen.queryByText(/slicing through the deck/i)).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  });

  it('copes with a room whose challenge has not arrived yet', () => {
    // A brief render between the status changing and the payload carrying the
    // challenge must not blank the screen.
    render(<ChallengeReel room={makeRoom({ challenge: null })} />);

    expect(screen.getByText('Your brief')).toBeInTheDocument();
  });
});
