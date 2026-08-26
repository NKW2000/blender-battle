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

    await userEvent.click(screen.getByRole('button', { name: /minutes longer/i }));

    expect(onChange).toHaveBeenCalledWith(local(35));
  });

  it('snaps a stray value onto the grid rather than drifting off it', async () => {
    /*
      A value 47 minutes out must step to 50, not 52. Stepping from where it
      happens to be would mean the readout never returns to a round number.
    */
    const { onChange } = setup(47);

    await userEvent.click(screen.getByRole('button', { name: /minutes longer/i }));

    expect(onChange).toHaveBeenCalledWith(local(50));
  });

  it('will not offer a deadline the server rejects', () => {
    // The API refuses anything closer than five minutes, so the control must not
    // be able to reach four.
    setup(5);

    expect(screen.getByRole('button', { name: /minutes shorter/i })).toBeDisabled();
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

  it('falls back to a sensible length rather than NaN', () => {
    // A cleared or half-typed value must not render "NaN min".
    render(<DeadlineField value="" now={NOW} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Room length').textContent).toContain('30 min');
  });
});
