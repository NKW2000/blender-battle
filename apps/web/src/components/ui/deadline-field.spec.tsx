import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DeadlineField } from './deadline-field';

/**
 * The room length control, set the way an alarm is set.
 *
 * Three wheels — days, hours, minutes — with the selection held in a lit band.
 * jsdom has no layout and cannot scroll, so the wheel's scroll handling is the
 * one part these cannot reach; everything the scroll ends up doing is reachable
 * by pressing a row or by the arrow keys, which is also the whole reason the
 * column is a listbox rather than a bare scroller.
 *
 * What matters is that the wheels always show the length that is actually set,
 * that the value they emit is still the `YYYY-MM-DDTHH:mm` local string the form
 * and the server expect, and that they cannot produce a deadline the server
 * will reject.
 */

const HOUR = 60;
const DAY = 24 * HOUR;

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

/** The field wired to state, the way the room form wires it. */
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

/** The number a given wheel is currently showing. */
const selectedOn = (wheel: string) =>
  within(screen.getByRole('listbox', { name: wheel }))
    .getAllByRole('option')
    .find((option) => option.getAttribute('aria-selected') === 'true')?.textContent;

const pressOn = (wheel: string, label: string) =>
  userEvent.click(within(screen.getByRole('listbox', { name: wheel })).getByText(label));

describe('the room length field', () => {
  it('offers a wheel for each unit', () => {
    setup(30);

    expect(screen.getByRole('listbox', { name: 'Days' })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Hours' })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Minutes' })).toBeInTheDocument();
  });

  it('shows the length that is actually set', () => {
    // 90 minutes is one hour and thirty, on the wheels, exactly.
    setup(90);

    expect(selectedOn('Days')).toBe('0');
    expect(selectedOn('Hours')).toBe('1');
    expect(selectedOn('Minutes')).toBe('30');
  });

  it('splits days out of a long room', () => {
    // A day and an hour, not "25 hours" and not a rounded "1 day".
    setup(DAY + HOUR);

    expect(selectedOn('Days')).toBe('1');
    expect(selectedOn('Hours')).toBe('1');
    expect(selectedOn('Minutes')).toBe('0');
  });

  it('carries every minute, not just round ones', () => {
    /*
      The minutes column runs 0–59 rather than in fives. A room set to 47 has to
      be able to say 47 — a coarser column would disagree with the value the
      moment anything else set one.
    */
    setup(47);

    expect(selectedOn('Minutes')).toBe('47');
  });

  it('sets the length from a press on a wheel', async () => {
    const { onChange } = setup(30);

    await pressOn('Hours', '2');

    expect(onChange).toHaveBeenCalledWith(local(2 * HOUR + 30));
  });

  it('sets days the same way', async () => {
    const { onChange } = setup(30);

    await pressOn('Days', '3');

    expect(onChange).toHaveBeenCalledWith(local(3 * DAY + 30));
  });

  it('moves a wheel with the arrow keys', async () => {
    /*
      The wheel is driven by scrolling, which a keyboard cannot do. Without this
      the control would be unreachable without a pointer, which is why each
      column is a listbox rather than a plain scroller.
    */
    const { onChange } = setupControlled(30);

    screen.getByRole('listbox', { name: 'Hours' }).focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(onChange).toHaveBeenLastCalledWith(local(HOUR + 30));
    expect(selectedOn('Hours')).toBe('1');
  });

  it('jumps to the ends of a wheel with Home and End', async () => {
    const { onChange } = setupControlled(30);

    screen.getByRole('listbox', { name: 'Minutes' }).focus();
    await userEvent.keyboard('{End}');

    expect(onChange).toHaveBeenLastCalledWith(local(59));
  });

  it('will not offer a deadline the server rejects', async () => {
    /*
      The API refuses anything closer than five minutes, so every wheel at zero
      has to come back as five rather than a deadline that has already passed.
    */
    const { onChange } = setupControlled(30);

    await pressOn('Minutes', '0');

    expect(onChange).toHaveBeenLastCalledWith(local(5));
  });

  it('will not go past a week', async () => {
    // Past this it is not a room, it is a challenge.
    const { onChange } = setupControlled(6 * DAY);

    await pressOn('Days', '7');
    await pressOn('Hours', '12');

    expect(onChange).toHaveBeenLastCalledWith(local(7 * DAY));
  });

  it('emits the same local string shape the form already used', async () => {
    const { onChange } = setup(30);

    await pressOn('Hours', '1');

    expect(onChange.mock.calls[0]?.[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
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
    render(<DeadlineField value={local(20 * HOUR)} now={NOW} onChange={vi.fn()} />);

    expect(screen.getByRole('status').textContent).toMatch(/ends \w{3}/);
  });

  it('decides "today" against the clock it was given, not the real one', () => {
    /*
      A regression guard with a date far from any real one.

      This field takes `now` as a prop precisely so what it renders is a
      function of its inputs, but the today-check read `new Date()`. The bug was
      invisible on any day the two happened to agree — it surfaced only when the
      calendar rolled over mid-session.
    */
    const then = new Date('2020-01-01T12:00:00').getTime();
    const twoHoursLater = new Date(then + 120 * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const value = `${twoHoursLater.getFullYear()}-${pad(twoHoursLater.getMonth() + 1)}-${pad(twoHoursLater.getDate())}T${pad(twoHoursLater.getHours())}:${pad(twoHoursLater.getMinutes())}`;

    render(<DeadlineField value={value} now={then} onChange={vi.fn()} />);

    expect(screen.getByRole('status').textContent).not.toMatch(/ends \w{3}\s/);
  });

  it('reports the length that was actually set, mid-minute', () => {
    /*
      The value is stored as `YYYY-MM-DDTHH:mm`, so the seconds are thrown away.
      Measured against a clock carrying seconds, thirty minutes came back as 29
      — the control disagreed with itself the instant it was touched. Every
      other test here uses a whole minute, which is why this went unnoticed.
    */
    const midMinute = new Date('2026-08-26T12:00:31').getTime();

    render(<DeadlineField value="2026-08-26T12:30" now={midMinute} onChange={vi.fn()} />);

    expect(selectedOn('Minutes')).toBe('30');
  });

  it('falls back to a sensible length rather than NaN', () => {
    // A cleared or half-typed value must not leave every wheel reading zero.
    render(<DeadlineField value="" now={NOW} onChange={vi.fn()} />);

    expect(screen.getByRole('status').textContent).toContain('30 min');
  });

  it('marks the invalid state without hiding the wheels', () => {
    const { container } = render(
      <DeadlineField value={local(30)} now={NOW} invalid onChange={vi.fn()} />,
    );

    expect(container.querySelector('.border-punch')).toBeInTheDocument();
    expect(screen.getAllByRole('listbox')).toHaveLength(3);
  });
});
