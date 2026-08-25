import { ChallengeAssetType, Difficulty } from '@bb/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { EventDetail } from '@/features/challenges/use-events';

/**
 * The challenge screen, against the parts of the design a static canvas cannot
 * state.
 *
 * The handoff draws one challenge: three reference images, three judging
 * criteria, no rules, no downloads, no tags. Read literally that is a fixed
 * layout; read as a design it is a shape that has to survive whatever a manager
 * actually filled in. These assert the second reading — that the reference
 * carousel is driven by however many images exist rather than by three, and
 * that the sections the sample happens not to have stay absent instead of
 * rendering as empty furniture.
 *
 * Written as a component test rather than checked in a browser because the
 * carousel is the one part of this screen with state, and its arrows and dots
 * are exactly what a screenshot cannot verify.
 */

const noop = () => undefined;

vi.mock('@/features/challenges/use-events', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useEvent: (_id: string, initial?: EventDetail) => ({
    data: initial,
    isLoading: false,
    error: null,
  }),
  useEnterEvent: () => ({ mutate: noop, isPending: false, isError: false, error: null }),
  useVoteEvent: () => ({ mutate: noop, isPending: false, isError: false, error: null }),
}));

// The button plays a click; jsdom has no AudioContext and the sound is not what
// is under test.
vi.mock('@/features/sound/use-sound', () => ({ useSound: () => noop }));

const { EventDetailView } = await import('./event-detail-view');

function asset(id: string, type = ChallengeAssetType.REFERENCE_IMAGE) {
  return {
    id,
    type,
    url: `https://cdn.test/${id}.jpg`,
    filename: `${id}.jpg`,
    bytes: 2048,
    sortOrder: 0,
  };
}

function makeEvent(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: 'e1',
    slug: 'the-couch',
    title: 'The couch',
    difficulty: Difficulty.EASY,
    category: { id: 'c1', name: 'Modeling' },
    tags: [],
    estimatedMinutes: 45,
    rewardXp: 50,
    coverImageUrl: null,
    shortDescription: 'A couch',
    startDate: new Date(Date.now() - 3_600_000).toISOString(),
    endDate: new Date(Date.now() + 86_400_000).toISOString(),
    votingEndsAt: null,
    winnerEntryId: null,
    phase: 'open',
    serverNow: new Date().toISOString(),
    referenceImageUrl: null,
    objectives: ['Focus on the textures', 'Clean edges', 'Nice modeling'],
    description: 'A couch with detailed texture on it',
    rules: null,
    allowedAssets: null,
    forbiddenAssets: null,
    blenderVersion: '5.0',
    assets: [asset('ref-1'), asset('ref-2')],
    myEntryId: null,
    myEntry: null,
    myVoteEntryId: null,
    entries: [],
    ...overrides,
  };
}

const view = (event: EventDetail) => render(<EventDetailView id="e1" initialEvent={event} />);

describe('the brief, on the page', () => {
  it('shows the whole brief rather than a link to it', () => {
    view(makeEvent());

    expect(screen.getByText('A couch with detailed texture on it')).toBeInTheDocument();
    expect(screen.getByText('45 min')).toBeInTheDocument();
    expect(screen.getByText('50 XP')).toBeInTheDocument();
    expect(screen.getByText('5.0')).toBeInTheDocument();
    // The detour this screen used to send people on.
    expect(screen.queryByText(/read the full brief/i)).not.toBeInTheDocument();
  });

  it('drops the Blender tile when no version is set', () => {
    // The design has no state for a stat tile with no value, so the tile goes
    // rather than rendering a label over an empty line.
    view(makeEvent({ blenderVersion: null }));

    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.queryByText('Blender')).not.toBeInTheDocument();
  });

  it('numbers the judging criteria in order', () => {
    view(makeEvent());
    const items = screen.getAllByRole('listitem');

    expect(items.map((item) => item.textContent)).toEqual([
      '1Focus on the textures',
      '2Clean edges',
      '3Nice modeling',
    ]);
  });

  it('renders nothing for rules, files and tags when the challenge has none', () => {
    // The design's own sample: with all three empty the page must match it
    // exactly, not carry three empty panels.
    view(makeEvent());

    expect(screen.queryByText('Rules')).not.toBeInTheDocument();
    expect(screen.queryByText('Files')).not.toBeInTheDocument();
  });

  it('renders them when it does', async () => {
    view(
      makeEvent({
        rules: 'No kitbashing.',
        forbiddenAssets: 'Downloaded models',
        tags: [{ id: 't1', slug: 'furniture', name: 'Furniture' }],
        assets: [asset('ref-1'), asset('pack', ChallengeAssetType.REFERENCE_FILE)],
      }),
    );

    expect(screen.getByText('Rules')).toBeInTheDocument();
    expect(screen.getByText('No kitbashing.')).toBeInTheDocument();
    expect(screen.getByText('Not allowed')).toBeInTheDocument();
    expect(screen.getByText('Furniture')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pack\.jpg/ })).toBeInTheDocument();
  });
});

describe('the reference carousel', () => {
  it('moves between references with the arrows, and wraps', async () => {
    const user = userEvent.setup();
    view(makeEvent());

    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next reference' }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    // Wraps rather than stopping — there is no disabled state in the design.
    await user.click(screen.getByRole('button', { name: 'Next reference' }));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous reference' }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('marks the current dot, and jumps when one is clicked', async () => {
    const user = userEvent.setup();
    view(makeEvent());

    const dots = screen.getAllByRole('button', { name: /^Reference \d$/ });
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');

    await user.click(dots[1]!);
    expect(dots[1]).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('drops the arrows and dots at a single reference', () => {
    // Furniture with nothing to do: one image cannot be paged.
    view(makeEvent({ assets: [asset('only')] }));

    expect(screen.queryByRole('button', { name: 'Next reference' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Reference \d$/ })).not.toBeInTheDocument();
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
  });

  it('says so when there are no references at all', () => {
    view(makeEvent({ assets: [] }));

    expect(screen.getByText(/no reference images/i)).toBeInTheDocument();
  });

  it('survives a reference being removed while the page is open', async () => {
    /*
      The page polls every 15 seconds. A manager deleting the third image while
      someone is looking at it would otherwise leave the track translated to a
      slide that no longer exists — a blank panel with no way back.
    */
    const user = userEvent.setup();
    const { rerender } = view(
      makeEvent({ assets: [asset('a'), asset('b'), asset('c')] }),
    );

    await user.click(screen.getByRole('button', { name: 'Reference 3' }));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    rerender(
      <EventDetailView id="e1" initialEvent={makeEvent({ assets: [asset('a'), asset('b')] })} />,
    );

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});

describe('phases', () => {
  it('offers the upload form while entries are open', () => {
    view(makeEvent());

    expect(screen.getByText('Enter the challenge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit entry/i })).toBeInTheDocument();
  });

  it('replaces it with the deadline before the window opens', () => {
    view(makeEvent({ phase: 'upcoming' }));

    expect(screen.getByText('Not open yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit entry/i })).not.toBeInTheDocument();
  });

  it('keeps the brief on the page in every phase', () => {
    // The reason this screen exists: the brief is not a thing you leave to read.
    for (const phase of ['upcoming', 'open', 'finished'] as const) {
      const { unmount } = view(makeEvent({ phase }));
      expect(screen.getByText('A couch with detailed texture on it')).toBeInTheDocument();
      expect(screen.getByText('Judged on')).toBeInTheDocument();
      unmount();
    }
  });
});

describe('after submitting an entry', () => {
  /*
    "I upload both, press submit, nothing happens, and after a refresh my photos
    are gone."

    Two faults produced that sentence and neither was the upload. Nothing
    confirmed a success — the mutation was the only one in the application that
    did not announce itself — and the payload carried `myEntryId` but not the
    entry, so a reload re-rendered an empty upload panel. A submission that
    worked looked exactly like a button that did nothing.
  */
  const entered = () =>
    makeEvent({
      myEntryId: 'entry-1',
      myEntry: {
        id: 'entry-1',
        imageUrl: 'https://cdn.test/mine-render.jpg',
        workspacePhotoUrl: 'https://cdn.test/mine-workspace.jpg',
        notes: null,
        submittedAt: new Date().toISOString(),
      },
    });

  it('shows both of your images back to you', () => {
    view(entered());

    expect(screen.getByAltText('Your render')).toHaveAttribute(
      'src',
      'https://cdn.test/mine-render.jpg',
    );
    expect(screen.getByAltText('Your workspace')).toHaveAttribute(
      'src',
      'https://cdn.test/mine-workspace.jpg',
    );
  });

  it('says you are on the ballot, and that it can still be replaced', () => {
    view(entered());
    expect(screen.getByText(/you are in/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /replace entry/i })).toBeInTheDocument();
  });

  it('shows nothing of the sort before entering', () => {
    view(makeEvent());

    expect(screen.queryByAltText('Your render')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit entry/i })).toBeInTheDocument();
  });

  it('copes with an entry whose workspace shot is missing', () => {
    // Legacy rows predate the workspace requirement; one image is still worth
    // showing, and reaching into a null would blank the whole page.
    view(
      makeEvent({
        myEntryId: 'entry-1',
        myEntry: {
          id: 'entry-1',
          imageUrl: 'https://cdn.test/mine-render.jpg',
          workspacePhotoUrl: null,
          notes: null,
          submittedAt: new Date().toISOString(),
        },
      }),
    );

    expect(screen.getByAltText('Your render')).toBeInTheDocument();
    expect(screen.queryByAltText('Your workspace')).not.toBeInTheDocument();
  });
});

/**
 * The results gallery.
 *
 * Every entry is a 1:1 image, so one per row put a single full-width square on
 * screen at a time and turned a ten-entry contest into an enormous scroll. It
 * swipes horizontally on a phone and returns to a grid from `sm` up.
 *
 * These assert the mechanism rather than the appearance — jsdom has no layout,
 * so a screenshot test is not available, but "is it still a horizontal
 * scroller" is exactly what a future refactor would break silently.
 */
function entry(id: string, username: string, voteCount: number) {
  return {
    id,
    userId: `u-${id}`,
    username,
    imageUrl: `https://cdn.test/${id}.png`,
    workspacePhotoUrl: null,
    notes: null,
    voteCount,
    submittedAt: new Date().toISOString(),
  };
}

describe('the results gallery', () => {
  const finished = () =>
    makeEvent({
      phase: 'finished',
      winnerEntryId: 'win',
      entries: [
        entry('win', 'winner', 10),
        entry('a', 'alice', 5),
        entry('b', 'bob', 3),
        entry('c', 'carol', 1),
      ],
    });

  it('scrolls horizontally rather than stacking', () => {
    view(finished());

    const gallery = screen.getByRole('group', { name: /other entries/i });

    // The pair that makes it a slideshow: overflow to scroll through, snapping
    // so it settles on a card instead of anywhere.
    expect(gallery.className).toContain('overflow-x-auto');
    expect(gallery.className).toContain('snap-x');
  });

  it('goes back to a grid on wider screens', () => {
    // The phone layout must not follow a desktop reader up: four squares in a
    // row is the right shape when there is width for it.
    view(finished());

    const gallery = screen.getByRole('group', { name: /other entries/i });

    expect(gallery.className).toContain('sm:grid');
    expect(gallery.className).toContain('sm:overflow-x-visible');
  });

  it('leaves the next card peeking, so there is something to swipe toward', () => {
    /*
      A card at full width reads as the only card. The cut-off edge of the next
      one is the entire affordance — without it a phone user has no reason to
      think anything is to the right.
    */
    view(finished());

    const card = screen.getByAltText('Entry by alice').closest('div');

    expect(card?.className).toContain('w-[78%]');
    expect(card?.className).toContain('snap-center');
  });

  it('keeps the winner out of the gallery', () => {
    // The winner has its own panel above; repeating it here would read as a tie.
    view(finished());

    const gallery = screen.getByRole('group', { name: /other entries/i });

    expect(gallery.textContent).not.toContain('winner');
    expect(gallery.textContent).toContain('alice');
  });

  it('orders the also-rans by votes', () => {
    view(finished());

    const names = screen
      .getByRole('group', { name: /other entries/i })
      .textContent?.replace(/\d+/g, '');

    expect(names?.indexOf('alice')).toBeLessThan(names?.indexOf('bob') ?? -1);
    expect(names?.indexOf('bob')).toBeLessThan(names?.indexOf('carol') ?? -1);
  });

  it('can be reached by keyboard', () => {
    // A scroll container is only reachable with a keyboard if something in it
    // can take focus, and these cards are not interactive.
    view(finished());

    expect(screen.getByRole('group', { name: /other entries/i })).toHaveAttribute('tabindex', '0');
  });
});
