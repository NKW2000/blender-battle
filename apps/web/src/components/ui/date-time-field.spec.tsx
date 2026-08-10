import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { DateTimeField, toLocalInputValue } from './date-time-field';

/**
 * The hand-built date and time picker.
 *
 * It replaced `datetime-local`, which could not be styled and follows the
 * operating system's locale rather than the application's — both good reasons.
 * The cost is owning a grid widget's keyboard model and its semantics, and the
 * first audit found the calendar emitting `gridcell` elements with no `row`
 * between them and the `grid`, which is an invalid structure: assistive
 * technology cannot report a position within the month, and some
 * implementations discard the grid semantics and read forty-two loose buttons.
 */

const AT = new Date(2026, 5, 15, 14, 30);

function Harness() {
  const [value, setValue] = useState(toLocalInputValue(AT));
  return <DateTimeField ariaLabel="Ends at" value={value} onChange={setValue} />;
}

/** The date half of the control; the time half is a separate trigger. */
const dateTrigger = () => screen.getAllByRole('button', { name: /Ends at/i })[0]!;

// One mount per test. `cleanup` in the setup file unmounts between them, so a
// second render inside a test would leave two calendars and every query
// ambiguous.
beforeEach(() => {
  render(<Harness />);
});

describe('DateTimeField — calendar semantics', () => {
  it('wraps every day in a row inside the grid', async () => {
    /*
      The regression this file exists for. `role="gridcell"` requires a
      `role="row"` ancestor; without it the whole grid is malformed.
    */
    await userEvent.click(dateTrigger());

    const grid = screen.getByRole('grid');
    const rows = within(grid).getAllByRole('row');

    expect(rows.length).toBeGreaterThan(0);
    for (const cell of within(grid).getAllByRole('gridcell')) {
      expect(cell.closest('[role="row"]')).not.toBeNull();
    }
  });

  it('gives every day a full spoken date, not just a number', async () => {
    // "15" alone is meaningless read aloud out of context; the visible label is
    // the number and the accessible name is the whole date.
    await userEvent.click(dateTrigger());

    const cells = within(screen.getByRole('grid')).getAllByRole('gridcell');
    expect(cells[0]).toHaveAccessibleName(/\w+day, \w+ \d+/);
  });

  it('marks exactly one day selected', async () => {
    await userEvent.click(dateTrigger());

    const selected = within(screen.getByRole('grid'))
      .getAllByRole('gridcell')
      .filter((cell) => cell.getAttribute('aria-selected') === 'true');

    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('15');
  });

  it('keeps one tab stop for the whole grid', async () => {
    /*
      Roving tabindex. Forty-two focusable buttons would mean forty-two Tab
      presses to get past a calendar, which is the single most common way a
      custom date picker becomes unusable by keyboard.
    */
    await userEvent.click(dateTrigger());

    const cells = within(screen.getByRole('grid')).getAllByRole('gridcell');
    const stops = cells.filter((cell) => cell.getAttribute('tabindex') === '0');

    expect(stops).toHaveLength(1);
  });

  it('opens as a labelled dialog and reports its state on the trigger', async () => {
    expect(dateTrigger()).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(dateTrigger());

    expect(dateTrigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/Ends at/i);
  });

  it('closes on Escape', async () => {
    await userEvent.click(dateTrigger());
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('DateTimeField — value', () => {
  it('renders the supplied instant rather than today', () => {
    // The control is controlled. Showing the current date when a value was
    // given is how a deadline silently moves.
    expect(dateTrigger()).toHaveTextContent('15');
  });

  it('picks a day without disturbing the time', async () => {
    /*
      The date and time halves edit one value. Choosing a day used to be a place
      where the time could be reset to midnight — which, for a deadline, turns
      "ends at 14:30" into "already ended".
    */
    await userEvent.click(dateTrigger());

    const cell = within(screen.getByRole('grid'))
      .getAllByRole('gridcell')
      .find((candidate) => candidate.textContent?.trim() === '20')!;
    await userEvent.click(cell);

    // Rendered 12-hour in the app's locale, so 14:30 reads as "2:30 PM".
    const timeTrigger = screen.getAllByRole('button', { name: /Ends at/i })[1]!;
    expect(timeTrigger).toHaveTextContent('2:30');
    expect(dateTrigger()).toHaveTextContent('20');
  });
});
