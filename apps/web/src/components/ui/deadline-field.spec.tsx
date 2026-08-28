import { render, screen } from '@testing-library/react';
import { useState } from 'react';
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

/**
 * The field wired to state, the way the room form wires it.
 *
 * `setup` hands it a fixed `value` and a spy, which is fine for asserting what
 * a single press emits. It is wrong for anything multi-step: the unit shown
 * depends on the length, so a test that switches unit and then types is
 * measuring a component whose value never moved.
 */
function setupControlled(minutes = 30) {
  const onChange = vi.fn();

  function Harness() {
    const [value, setValue] = useState(local(minutes));
    return (
      <DeadlineField
        value={value}
        now={NOW}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    );
  }

  render(<Harness />);
  return { onChange };
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

    const readout = screen.getByRole('status');

    expect(readout.textContent).toContain('1h 30m');
    expect(readout.textContent).toMatch(/ends/);
  });

  it('names the day once a round runs past today', () => {
    // "ends 09:15" is ambiguous for an overnight round.
    render(<DeadlineField value={local(20 * 60)} now={NOW} onChange={vi.fn()} />);

    const readout = screen.getByRole('status');

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
    expect(screen.getByRole('status').textContent).not.toMatch(/ends \w{3}\s/);
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

    expect(screen.getByRole('status').textContent).toContain('1d 6h');
  });

  it('still says a plain day when nothing is left over', () => {
    render(<DeadlineField value={local(24 * 60)} now={NOW} onChange={vi.fn()} />);

    expect(screen.getByRole('status').textContent).toContain('1 day');
  });

  it('cannot be pushed past a week', async () => {
    // Past this it is not a room, it is a challenge.
    setup(7 * 24 * 60);

    expect(screen.getByRole('button', { name: /longer/i })).toBeDisabled();
  });

  it('takes an exact number typed into it', async () => {
    /*
      The point of the box. The presets and the stepper can reach any value, but
      only by pressing at one — a host who already knows they want 47 minutes
      should be able to say so rather than nudge their way there.
    */
    const { onChange } = setup(30);

    const box = screen.getByLabelText('Room length');
    await userEvent.clear(box);
    await userEvent.type(box, '47');

    expect(onChange).toHaveBeenLastCalledWith(local(47));
  });

  it('does not fight a half-typed number', async () => {
    /*
      Clearing the box to type "120" reads as 0 for a keystroke. Snapping that
      to the floor would rewrite the field under the person using it and make
      the second digit impossible to reach.
    */
    const { onChange } = setup(30);

    const box = screen.getByLabelText('Room length');
    await userEvent.clear(box);

    expect(onChange).not.toHaveBeenCalled();
    expect(box).toHaveValue('');
  });

  it('counts in whichever unit is chosen', async () => {
    const { onChange } = setupControlled(30);

    await userEvent.click(screen.getByRole('button', { name: 'HRS' }));
    const box = screen.getByLabelText('Room length');
    await userEvent.clear(box);
    await userEvent.type(box, '3');

    expect(onChange).toHaveBeenLastCalledWith(local(3 * 60));
  });

  it('types days directly', async () => {
    const { onChange } = setupControlled(30);

    await userEvent.click(screen.getByRole('button', { name: 'DAYS' }));
    const box = screen.getByLabelText('Room length');
    await userEvent.clear(box);
    await userEvent.type(box, '4');

    expect(onChange).toHaveBeenLastCalledWith(local(4 * 24 * 60));
  });

  it('opens in the unit the current length reads in', () => {
    // A two-day room should not present itself as 2880 minutes.
    render(<DeadlineField value={local(2 * 24 * 60)} now={NOW} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'DAYS' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Room length')).toHaveValue('2');
  });

  it('converts the length when the unit changes rather than reinterpreting it', async () => {
    // A box reading "2" while the room runs 90 minutes would simply be lying.
    const { onChange } = setup(90);

    await userEvent.click(screen.getByRole('button', { name: 'HRS' }));

    expect(onChange).toHaveBeenLastCalledWith(local(2 * 60));
  });

  it('will not accept a length the server rejects', async () => {
    // Typing 1 minute must not produce a deadline the API bounces.
    const { onChange } = setup(30);

    const box = screen.getByLabelText('Room length');
    await userEvent.clear(box);
    await userEvent.type(box, '1');

    expect(onChange).toHaveBeenLastCalledWith(local(5));
  });

  it('will not accept a length past the ceiling', async () => {
    const { onChange } = setupControlled(30);

    await userEvent.click(screen.getByRole('button', { name: 'DAYS' }));
    const box = screen.getByLabelText('Room length');
    await userEvent.clear(box);
    await userEvent.type(box, '90');

    expect(onChange).toHaveBeenLastCalledWith(local(7 * 24 * 60));
  });

  it('reports the length that was actually pressed, mid-minute', () => {
    /*
      The value is stored as `YYYY-MM-DDTHH:mm`, so the seconds are thrown away.
      Measured against a clock carrying seconds, "30 min" came back as 29 — the
      control disagreed with itself the instant it was touched. Every other test
      here uses a whole minute, which is exactly why this went unnoticed.
    */
    const midMinute = new Date('2026-08-26T12:00:31').getTime();
    const onChange = vi.fn();
    const { rerender } = render(
      <DeadlineField value={local(30)} now={midMinute} onChange={onChange} />,
    );

    rerender(<DeadlineField value="2026-08-26T12:30" now={midMinute} onChange={onChange} />);

    expect(screen.getByLabelText('Room length')).toHaveValue('30');
  });

  it('never shows a number its unit cannot count exactly', () => {
    /*
      The box used to pick the largest unit the length exceeded and round into
      it, so a ninety-minute room displayed "2" beside HRS. The field said one
      thing and the room did another. A unit only gets the display if the length
      divides into it with nothing over.
    */
    render(<DeadlineField value={local(90)} now={NOW} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Room length')).toHaveValue('90');
    expect(screen.getByRole('button', { name: 'MIN' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('drops to an exact unit when a nudge lands off the chosen one', async () => {
    /*
      Choosing HRS and then stepping to 105 minutes leaves the hours box with
      nothing honest to show. It reports minutes until the length fits hours
      again, rather than rounding and misreporting.
    */
    const { onChange } = setupControlled(2 * 60);

    await userEvent.click(screen.getByRole('button', { name: 'HRS' }));
    expect(screen.getByLabelText('Room length')).toHaveValue('2');

    await userEvent.click(screen.getByRole('button', { name: /shorter/i }));

    expect(onChange).toHaveBeenLastCalledWith(local(105));
    expect(screen.getByLabelText('Room length')).toHaveValue('105');
    expect(screen.getByRole('button', { name: 'MIN' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('returns to the chosen unit once the length fits it again', async () => {
    // The preference is not thrown away by one awkward value.
    setupControlled(2 * 60);

    await userEvent.click(screen.getByRole('button', { name: 'HRS' }));
    // Off the hour: the display drops to minutes.
    await userEvent.click(screen.getByRole('button', { name: /shorter/i }));
    expect(screen.getByRole('button', { name: 'MIN' })).toHaveAttribute('aria-pressed', 'true');

    // Back onto a whole hour, and the preference comes back with it.
    await userEvent.click(screen.getByRole('button', { name: '2 hours' }));

    expect(screen.getByRole('button', { name: 'HRS' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Room length')).toHaveValue('2');
  });

  it('stops showing a typed number once something else changes the value', async () => {
    /*
      Typing 39 days clamps the room to the seven-day ceiling, and the box was
      left reading "39" against a summary saying "7 days" — the two halves of
      one control disagreeing. Anything that is not typing now clears it.
    */
    setupControlled(30);

    await userEvent.click(screen.getByRole('button', { name: 'DAYS' }));
    const box = screen.getByLabelText('Room length');
    await userEvent.clear(box);
    await userEvent.type(box, '39');

    await userEvent.click(screen.getByRole('button', { name: '1 hour' }));

    expect(screen.getByLabelText('Room length')).toHaveValue('1');
    expect(screen.getByRole('status').textContent).toContain('1 hour');
  });

  it('falls back to a sensible length rather than NaN', () => {
    // A cleared or half-typed value must not render "NaN min".
    render(<DeadlineField value="" now={NOW} onChange={vi.fn()} />);

    expect(screen.getByRole('status').textContent).toContain('30 min');
  });
});
