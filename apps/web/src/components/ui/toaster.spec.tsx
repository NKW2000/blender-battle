import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Where toasts appear, and how several of them behave at once.
 *
 * Both settings here were reported as bugs rather than preferences: errors that
 * could not be seen on a phone, and errors that became unreadable once more than
 * one arrived. So the props are asserted directly — sonner is mocked to capture
 * them, because what it does with them is its business and jsdom has no layout
 * to measure anyway.
 */

const captured: Record<string, unknown>[] = [];

vi.mock('sonner', () => ({
  Toaster: (props: Record<string, unknown>) => {
    captured.push(props);
    return null;
  },
}));

const { Toaster } = await import('./toaster');

function withViewport(isPhone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('max-width') ? isPhone : !isPhone,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

afterEach(() => {
  captured.length = 0;
});

describe('the toaster', () => {
  it('puts toasts at the top on a phone', () => {
    /*
      The bottom edge of a phone is the most contested space on the device: the
      browser's URL bar, the home indicator, and the on-screen keyboard all live
      there. A toast reporting a failed submit fires while the keyboard is still
      up, which is exactly when a bottom-anchored one cannot be seen.
    */
    withViewport(true);
    render(<Toaster />);

    expect(captured.at(-1)?.position).toBe('top-center');
  });

  it('keeps the bottom-right corner on a desktop', () => {
    // Nothing competes for that corner on a desktop, and it is where a toast is
    // least likely to cover what someone is reading.
    withViewport(false);
    render(<Toaster />);

    expect(captured.at(-1)?.position).toBe('bottom-right');
  });

  it('stacks several toasts at full size instead of shrinking them', () => {
    /*
      Sonner's default collapses everything behind the newest toast and scales it
      down, so a second and third error arrive as slivers of shrinking text. That
      is the exact moment the words matter most — a failed upload usually reports
      more than one thing.
    */
    withViewport(false);
    render(<Toaster />);

    expect(captured.at(-1)?.expand).toBe(true);
  });

  it('caps how many are on screen at once', () => {
    // Past three the screen is the problem rather than the reporting.
    withViewport(false);
    render(<Toaster />);

    expect(captured.at(-1)?.visibleToasts).toBe(3);
  });

  it('leaves a server error on screen long enough to read', () => {
    // These are full sentences from the API, not one-word confirmations.
    withViewport(false);
    render(<Toaster />);

    expect(captured.at(-1)?.duration).toBe(6000);
  });

  it('insets the card from both edges on a phone', () => {
    // The default card is 356px, which hangs off a 375px screen.
    withViewport(true);
    render(<Toaster />);

    expect(captured.at(-1)?.mobileOffset).toMatchObject({ left: 16, right: 16, top: 16 });
  });
});
