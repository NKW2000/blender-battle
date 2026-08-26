import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SwipeRow } from './swipe-row';

/**
 * The swipeable row.
 *
 * jsdom has no layout, so every element reports a width of zero and the
 * component's own measurements would answer "nothing overflows" for ever. The
 * dimensions are therefore defined by hand below and a scroll event is fired to
 * make the component re-read them — which is exactly the path a real browser
 * takes, just with the numbers supplied rather than computed.
 *
 * What is worth holding is the rule the arrows follow: they exist only when
 * there is somewhere to go, and they stop at each end. A row that renders two
 * dead controls under three thumbnails is worse than one with no controls.
 */

function layout(
  element: HTMLElement,
  { scrollWidth, clientWidth, scrollLeft = 0 }: { scrollWidth: number; clientWidth: number; scrollLeft?: number },
) {
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: clientWidth });
  Object.defineProperty(element, 'scrollLeft', { configurable: true, writable: true, value: scrollLeft });
  fireEvent.scroll(element);
}

function renderRow(children = ['a', 'b', 'c'].map((k) => <span key={k}>{k}</span>)) {
  render(<SwipeRow ariaLabel="3 works">{children}</SwipeRow>);
  return screen.getByRole('group', { name: '3 works' });
}

describe('a swipeable row', () => {
  it('shows no arrows when everything already fits', () => {
    // Three thumbnails on a desktop need no controls, and two dead buttons under
    // them read as broken rather than as "nothing to scroll".
    const row = renderRow();
    layout(row, { scrollWidth: 300, clientWidth: 300 });

    expect(screen.queryByRole('button', { name: /scroll/i })).not.toBeInTheDocument();
  });

  it('shows arrows once the row overflows', () => {
    const row = renderRow();
    layout(row, { scrollWidth: 900, clientWidth: 300 });

    expect(screen.getByRole('button', { name: 'Scroll left' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scroll right' })).toBeInTheDocument();
  });

  it('disables the left arrow at the start', () => {
    // There is nothing to the left of the first item, and an arrow that looks
    // available but does nothing is a worse answer than one that says so.
    const row = renderRow();
    layout(row, { scrollWidth: 900, clientWidth: 300, scrollLeft: 0 });

    expect(screen.getByRole('button', { name: 'Scroll left' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Scroll right' })).toBeEnabled();
  });

  it('disables the right arrow at the end', () => {
    const row = renderRow();
    layout(row, { scrollWidth: 900, clientWidth: 300, scrollLeft: 600 });

    expect(screen.getByRole('button', { name: 'Scroll right' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Scroll left' })).toBeEnabled();
  });

  it('tolerates a fractional scroll position at the end', () => {
    /*
      Fractional layout means the sum lands a fraction short of `scrollWidth`.
      Comparing exactly leaves the arrow you need enabled at one end and the one
      you just used enabled at the other.
    */
    const row = renderRow();
    layout(row, { scrollWidth: 900, clientWidth: 300, scrollLeft: 599.6 });

    expect(screen.getByRole('button', { name: 'Scroll right' })).toBeDisabled();
  });

  it('scrolls forwards when the right arrow is pressed', async () => {
    const row = renderRow();
    const scrollBy = vi.fn();
    row.scrollBy = scrollBy;
    layout(row, { scrollWidth: 900, clientWidth: 300 });

    await userEvent.click(screen.getByRole('button', { name: 'Scroll right' }));

    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
    expect(scrollBy.mock.calls[0]?.[0].left).toBeGreaterThan(0);
  });

  it('scrolls backwards when the left arrow is pressed', async () => {
    const row = renderRow();
    const scrollBy = vi.fn();
    row.scrollBy = scrollBy;
    layout(row, { scrollWidth: 900, clientWidth: 300, scrollLeft: 300 });

    await userEvent.click(screen.getByRole('button', { name: 'Scroll left' }));

    expect(scrollBy.mock.calls[0]?.[0].left).toBeLessThan(0);
  });

  it('can be reached by keyboard', () => {
    // Nothing inside is guaranteed to be focusable, and a scroller nobody can
    // focus is content nobody can reach without a pointer.
    expect(renderRow()).toHaveAttribute('tabindex', '0');
  });

  it('names the row for a screen reader', () => {
    expect(renderRow()).toHaveAttribute('aria-label', '3 works');
  });

  it('renders its children in order', () => {
    const row = renderRow();

    expect(row.textContent).toBe('abc');
  });
});
