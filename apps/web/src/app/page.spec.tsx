import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The front door's choice of what to paint before it knows.
 *
 * Whether there is a session is a question only the server can answer, and the
 * answer takes a second or two to arrive on a cold load. What this covers is
 * the gap: a returning player used to be shown the marketing page and then
 * yanked to the arena mid-sentence, which reads as the app signing them in by
 * itself.
 *
 * Deterministic on purpose. The real window is a few hundred milliseconds and
 * depends on a network round trip, so watching for it in a browser is a race;
 * the decision itself is a plain conditional and is worth pinning exactly.
 */

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const session: { user: unknown; isLoading: boolean } = { user: null, isLoading: true };
let hint = false;

vi.mock('@/features/auth/use-session', () => ({
  useSession: () => ({
    user: session.user,
    isLoading: session.isLoading,
    isAuthenticated: Boolean(session.user),
  }),
  probablySignedIn: () => hint,
}));

vi.mock('@/components/arcade/landing', () => ({
  ArcadeLanding: () => <div data-testid="landing">landing</div>,
}));

const { default: RootPage } = await import('./page');

const isLanding = () => screen.queryByTestId('landing') !== null;
const isWaiting = () => screen.queryByRole('status') !== null;

beforeEach(() => {
  session.user = null;
  session.isLoading = true;
  hint = false;
  replace.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('the front door, before the session is known', () => {
  it('shows the landing page at once to a browser that has never signed in', () => {
    /*
      The first-time visitor is the one the page exists for. Making them watch a
      spinner for a second to spare a returning player a redirect is the wrong
      way round.
    */
    hint = false;
    session.isLoading = true;

    render(<RootPage />);

    expect(isLanding()).toBe(true);
    expect(isWaiting()).toBe(false);
  });

  it('waits, rather than showing a page it is about to take away', () => {
    // A browser that was signed in last time almost certainly still is, and is
    // headed for /rooms the moment the answer lands.
    hint = true;
    session.isLoading = true;

    render(<RootPage />);

    expect(isWaiting()).toBe(true);
    expect(isLanding()).toBe(false);
  });

  it('falls back to the landing page when the session turns out to be gone', () => {
    // The cookie expired since the last visit: the hint was right about the
    // past and wrong about now, and the cost is a brief wait, not a wrong page.
    hint = true;
    session.isLoading = false;
    session.user = null;

    render(<RootPage />);

    expect(isLanding()).toBe(true);
    expect(isWaiting()).toBe(false);
  });

  it('sends a signed-in player to the arena', () => {
    session.isLoading = false;
    session.user = { id: 'u1' };

    render(<RootPage />);

    expect(replace).toHaveBeenCalledWith('/rooms');
  });

  it('never flashes the pitch at a player it is redirecting', () => {
    // The bug this whole thing is about: the landing page must not appear on
    // the way to the arena.
    session.isLoading = false;
    session.user = { id: 'u1' };

    render(<RootPage />);

    expect(isLanding()).toBe(false);
  });

  it('does not redirect while the answer is still outstanding', () => {
    // Redirecting on "not signed in yet" would bounce every anonymous visitor.
    session.isLoading = true;
    session.user = null;

    render(<RootPage />);

    expect(replace).not.toHaveBeenCalled();
  });
});
