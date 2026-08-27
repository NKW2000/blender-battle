import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DeadlineField } from './deadline-field';

/**
 * The room length control.
 *
 * It replaced a date-and-time picker that opened a month grid with year and
 * month paging, for a value that is almost always under two hours. What matters
 * now is that the common lengths are one press away, that the value it emits is
 * still the same `YYYY-MM-DDTHH:mm` local string the form and server expect, and
 * that it cannot produce a deadline the server will reject.
 */

// A fixed instant so "in 30 minutes" is an exact string rather than a race.
const NOW = new Date('2026-08-26T12:00:00').getTime();

function local(minutesFromNow: number): string {
  const at = new Date(NOW + minutesFromNow * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function setup(minutes = 30) {
  const onChange = vi.fn();
  render(<DeadlineField value={local(minutes)} now={NOW} onChange={onChange} />);
  return { onChange };
}

describe('the room length field', () => {
  it('sets a common length in one press', async () => {
    // The whole point of replacing the calendar: two hours should not require
    // opening a month.
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: '2 hours' }));

    expect(onChange).toHaveBeenCalledWith(local(120));
  });

  it('emits the same local string shape the form already used', async () => {
    /*
      The control changed; the contract did not. The form parses this with
      `new Date(...)` and the server takes the resulting instant, so a different
      shape here would break both without touching either file.
    */
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: '1 hour' }));

    expect(onChange.mock.calls[0]?.[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('shows which preset is currently selected', () => {
    // Without this the four buttons read as actions rather than a choice, and
    // nothing on screen says what the current length is.
    setup(60);

    expect(screen.getByRole('button', { name: '1 hour' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '30 min' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps a preset selected as the clock ticks underneath it', () => {
    /*
      The page re-reads the clock every fifteen seconds, so a value set to
      exactly 60 minutes becomes 59-point-something almost immediately. Matching
      exactly would make the highlight flicker off a second after being pressed.
    */
    render(<DeadlineField value={local(60)} now={NOW + 90_000} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: '1 hour' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('steps in five-minute increments', async () => {
    const { onChange } = setup(30);

    await userEvent.click(screen.getByRole('button', { name: /longer/i }));

    expect(onChange).toHaveBeenCalledWith(local(35));
  });

  it('snaps a stray value onto the grid rather than drifting off it', async () => {
    /*
      A value 47 minutes out must step to 50, not 52. Stepping from where it
      happens to be would mean the readout never returns to a round number.
    */
    const { onChange } = setup(47);

    await userEvent.click(screen.getByRole('button', { name: /longer/i }));

    expect(onChange).toHaveBeenCalledWith(local(50));
  });

  it('will not offer a deadline the server rejects', () => {
    // The API refuses anything closer than five minutes, so the control must not
    // be able to reach four.
    setup(5);

    expect(screen.getByRole('button', { name: /shorter/i })).toBeDisabled();
  });

  it('states the length and the time it lands on', () => {
    // The length is what is being chosen; the finish time is what players see.
    setup(90);

    const readout = screen.getByLabelText('Room length');

    expect(readout.textContent).toContain('1h 30m');
    expect(readout.textContent).toMatch(/ends/);
  });

  it('names the day once a round runs past today', () => {
    // "ends 09:15" is ambiguous for an overnight round.
    render(<DeadlineField value={local(20 * 60)} now={NOW} onChange={vi.fn()} />);

    const readout = screen.getByLabelText('Room length');

    expect(readout.textContent).toMatch(/ends \w{3}/);
  });

  it('decides "today" against the clock it was given, not the real one', () => {
    /*
      A regression guard with a date far from any real one.

      This field takes `now` as a prop precisely so what it renders is a
      function of its inputs, but the today-check read `new Date()`. The bug was
      invisible on any day the two happened to agree — it surfaced only when the
      calendar rolled over mid-session. Pinning `now` to 2020 means a reading of
      the real clock can never agree by luck.
    */
    const then = new Date('2020-01-01T12:00:00').getTime();
    const twoHoursLater = new Date(then + 120 * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const value = `${twoHoursLater.getFullYear()}-${pad(twoHoursLater.getMonth() + 1)}-${pad(twoHoursLater.getDate())}T${pad(twoHoursLater.getHours())}:${pad(twoHoursLater.getMinutes())}`;

    render(<DeadlineField value={value} now={then} onChange={vi.fn()} />);

    // Same day as `now`, so the weekday is redundant and left off.
    expect(screen.getByLabelText('Room length').textContent).not.toMatch(/ends \w{3}\s/);
  });

  it('offers lengths in days, not just hours', () => {
    /*
      The server puts no ceiling on a room deadline — a group running over a
      weekend is a normal thing to want — but the control stopped at two hours,
      so the whole upper half of that range was unreachable in practice.
    */
    setup(30);

    expect(screen.getByRole('button', { name: '1 day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 week' })).toBeInTheDocument();
  });

  it('sets a whole day in one press', async () => {
    const { onChange } = setup(30);

    await userEvent.click(screen.getByRole('button', { name: '1 day' }));

    expect(onChange).toHaveBeenCalledWith(local(24 * 60));
  });

  it('steps by six hours once a room runs for days', async () => {
    /*
      The reason the step is not fixed. At five minutes a day is nearly three
      hundred presses, and nudging a three-day deadline by five minutes is not
      an adjustment anyone means to make.
    */
    const { onChange } = setup(3 * 24 * 60);

    await userEvent.click(screen.getByRole('button', { name: /longer/i }));

    expect(onChange).toHaveBeenCalledWith(local(3 * 24 * 60 + 6 * 60));
  });

  it('keeps five-minute steps for a speed round', async () => {
    // The short end is what this control was built for and must not get coarser.
    const { onChange } = setup(30);

    await userEvent.click(screen.getByRole('button', { name: /longer/i }));

    expect(onChange).toHaveBeenCalledWith(local(35));
  });

  it('names the step it is about to take', () => {
    // "5 minutes longer" was a fixed label on a step that now varies; a button
    // that lies about its own size is worse than one with no label.
    setup(3 * 24 * 60);

    expect(screen.getByRole('button', { name: /6 hours longer/i })).toBeInTheDocument();
  });

  it('reports the hours left over from a day', () => {
    /*
      Rounding to whole days called a day and a half "2 days", and showed no
      change at all while the stepper moved through it.
    */
    render(<DeadlineField value={local(24 * 60 + 6 * 60)} now={NOW} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Room length').textContent).toContain('1d 6h');
  });

  it('still says a plain day when nothing is left over', () => {
    render(<DeadlineField value={local(24 * 60)} now={NOW} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Room length').textContent).toContain('1 day');
  });

  it('cannot be pushed past a week', async () => {
    // Past this it is not a room, it is a challenge.
    setup(7 * 24 * 60);

    expect(screen.getByRole('button', { name: /longer/i })).toBeDisabled();
  });

  it('falls back to a sensible length rather than NaN', () => {
    // A cleared or half-typed value must not render "NaN min".
    render(<DeadlineField value="" now={NOW} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Room length').textContent).toContain('30 min');
  });
});
