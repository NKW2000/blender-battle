'use client';

import { CHALLENGE_MIN_MINUTES } from '@bb/shared';
import { useMemo, useState } from 'react';

import { toLocalInputValue } from '@/components/ui/date-time-field';
import { cn } from '@/lib/utils';

/**
 * How long the room runs for.
 *
 * This replaced a full date-and-time picker, which was the wrong instrument for
 * the question. A room deadline is a length, not a date — and the picker it
 * inherited opened a month grid with arrows for paging through months and years.
 * Nobody has ever scheduled a room for March. Reaching "in two hours" meant
 * opening a calendar, confirming today is still today, and then nudging a clock.
 *
 * So the control asks the question the host is actually answering: how long do
 * players get? The presets cover almost every round in one press, and the
 * stepper beside them handles the rest without a popover, a grid, or a concept
 * of months existing at all.
 *
 * The range runs from five minutes to a week, because the server's range does.
 * It caps nothing above the floor: a room that runs over a weekend is a normal
 * thing to want, and the deadline is a schedule rather than an estimate of how
 * long the modelling takes.
 *
 * The value stays `YYYY-MM-DDTHH:mm` local wall clock, unchanged, so the form
 * around it and the server contract both stay exactly as they were.
 */

const HOUR = 60;
const DAY = 24 * HOUR;

/**
 * The lengths a round actually gets set to, in minutes.
 *
 * The first four are the speed rounds this control was built for. The last two
 * exist because the stepper alone cannot reasonably reach them: at five-minute
 * nudges a day is nearly three hundred presses, so without a preset the whole
 * upper half of the server's range was theoretical.
 */
const PRESETS = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: HOUR, label: '1 hour' },
  { minutes: 2 * HOUR, label: '2 hours' },
  { minutes: DAY, label: '1 day' },
  { minutes: 7 * DAY, label: '1 week' },
];

/** Half an hour, which is a typical round and what the form already opened on. */
const DEFAULT_MINUTES = 30;

/*
  The step grows with the length.

  Five minutes matched the picker this replaced and is right for a speed round,
  but it is the wrong unit once a room runs for days — nudging a three-day
  deadline by five minutes is not an adjustment anyone means to make, and
  crossing that range at that size takes hundreds of presses. Each band is about
  as fine as the number it is adjusting deserves.
*/
const BASE_STEP_MINUTES = 5;

/**
 * The units the number in the box can be counted in.
 *
 * Three, because they are the three the readout already speaks in. A host
 * thinking "forty minutes" and a host thinking "three days" are answering the
 * same question and should not have to convert it into someone else's unit to
 * type it.
 */
const UNITS = [
  { id: 'min', label: 'MIN', minutes: 1 },
  { id: 'hour', label: 'HRS', minutes: HOUR },
  { id: 'day', label: 'DAYS', minutes: DAY },
] as const;

type UnitId = (typeof UNITS)[number]['id'];

function unitLength(unit: UnitId): number {
  return UNITS.find((option) => option.id === unit)?.minutes ?? 1;
}

/**
 * The largest unit that counts this length exactly.
 *
 * "Most natural" was the wrong test and produced a box that lied: ninety
 * minutes is more than an hour, so it was shown in hours, and rounding put a
 * "2" in a field describing a ninety-minute room. A unit only earns the display
 * if the length divides into it with nothing left over.
 */
function exactUnit(minutes: number): UnitId {
  if (minutes % DAY === 0) return 'day';
  if (minutes % HOUR === 0) return 'hour';
  return 'min';
}

function stepFor(minutes: number): number {
  if (minutes < 2 * HOUR) return BASE_STEP_MINUTES;
  if (minutes < 8 * HOUR) return 15;
  if (minutes < DAY) return HOUR;
  return 6 * HOUR;
}

/*
  The server's own floor, not a second copy of it.

  The API rejects anything closer than this, so a control that let you pick 3
  minutes would be offering a value it knows will bounce.
*/
const FLOOR_MINUTES = CHALLENGE_MIN_MINUTES;

/** A week out. Past this it is not a room, it is a challenge. */
const CEILING_MINUTES = 7 * DAY;

export function DeadlineField({
  value,
  onChange,
  now,
  invalid = false,
  className,
}: {
  /** `YYYY-MM-DDTHH:mm`, local wall clock. */
  value: string;
  onChange: (value: string) => void;
  /** The current time, passed in so the page's ticking clock stays the source. */
  now: number;
  invalid?: boolean;
  className?: string;
}) {
  const minutes = useMemo(() => minutesFromNow(value, now), [value, now]);

  /*
    The unit the host last asked for, and what is currently typed in the box.

    `draft` is null whenever the box is showing the value rather than an edit in
    progress. It has to exist: deriving the number straight from `minutes` means
    clearing the box to type "45" reads as 0, gets clamped to the floor, and the
    field fights the person using it after every keystroke.
  */
  // Opened in whatever unit counts the length it was given: a two-day room
  // presents itself as 2 DAYS, not 2880 MIN.
  const [preferredUnit, setPreferredUnit] = useState<UnitId>(() =>
    exactUnit(minutesFromNow(value, now)),
  );
  const [draft, setDraft] = useState<string | null>(null);

  /*
    A preference, honoured only while it stays true.

    Nudging or a preset can land on a length the chosen unit cannot count — an
    hours box has nothing honest to show for 105 minutes. Rather than round and
    misreport it, the display falls back to the unit that does count it exactly,
    and the preference returns as soon as it fits again.
  */
  const unit = minutes % unitLength(preferredUnit) === 0 ? preferredUnit : exactUnit(minutes);
  const unitMinutes = unitLength(unit);

  const set = (nextMinutes: number) => {
    const clamped = Math.min(CEILING_MINUTES, Math.max(FLOOR_MINUTES, nextMinutes));
    onChange(toLocalInputValue(new Date(now + clamped * 60_000)));
  };

  // The edit in progress if there is one, otherwise the value — which the line
  // above guarantees is a whole number of the unit on show.
  const amount = draft ?? String(Math.max(1, Math.round(minutes / unitMinutes)));

  const commitAmount = (raw: string) => {
    // Digits only. A text box rather than `type="number"`, whose scroll wheel
    // silently rewrites the value when the page moves under the pointer.
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 4);
    setDraft(digits);

    const parsed = Number(digits);
    // An empty or half-typed box is left alone rather than snapped to the floor.
    if (digits === '' || !Number.isFinite(parsed) || parsed <= 0) return;

    set(parsed * unitMinutes);
  };

  /* Switching unit converts the length rather than reinterpreting the digits.
     A box reading "2" while the room runs an hour and a half is simply lying,
     so the length is rounded to a whole number of the new unit and emitted. */
  const switchUnit = (next: UnitId) => {
    setPreferredUnit(next);
    setDraft(null);
    set(Math.max(1, Math.round(minutes / unitLength(next))) * unitLength(next));
  };

  /*
    Rounded to the step before nudging, not after.

    Without this, a deadline that is currently 47 minutes out steps to 52, then
    57 — the value drifts off the grid and never returns to it. Snapping first
    means the first press lands on 45 or 50 and every press after is a round
    number.
  */
  const step = stepFor(minutes);

  const nudge = (direction: 1 | -1) => {
    /*
      Snapped to the step in force at the length being left, then moved.

      Stepping down out of a band lands on a value the smaller step owns, which
      is what should happen: a day minus one press is eighteen hours, and from
      there the hour step takes over.
    */
    const snapped = Math.round(minutes / step) * step;
    // The half-typed number is not the value any more, so it stops being shown.
    setDraft(null);
    set(snapped + direction * step);
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {PRESETS.map((preset) => {
          /*
            Close enough counts as "this one", so a preset stays lit while the
            clock ticks down underneath it. The tolerance is proportional
            because the labels are: a week is still "1 week" an hour later, but
            fifteen minutes stops being "15 min" almost immediately.
          */
          const tolerance = Math.max(BASE_STEP_MINUTES / 2, preset.minutes * 0.01);
          const active = Math.abs(minutes - preset.minutes) < tolerance;

          return (
            <button
              key={preset.minutes}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setDraft(null);
                set(preset.minutes);
              }}
              className={cn(
                'arcade-focus rounded-[14px] border-[3px] px-3 py-3 font-display text-[15px] font-bold transition-colors',
                active
                  ? 'border-sun bg-sun/20 text-cream'
                  : 'border-white/16 bg-white/6 text-bone hover:bg-white/12',
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/*
        The number, big, with the stepper either side of it.

        This row used to hold the minus, the box and three unit pills as well —
        five controls inside 56 pixels, with the units at ten-point type and a
        target under half the size everything else in this product uses. They
        now have a row each, and the number gets the room it deserves for being
        the thing the field is actually asking for.
      */}
      <div className="flex items-center gap-2">
        <NudgeButton
          label={`${formatLength(step)} shorter`}
          disabled={minutes <= FLOOR_MINUTES}
          onClick={() => nudge(-1)}
        >
          −
        </NudgeButton>

        <div
          className={cn(
            'flex h-16 flex-1 items-center justify-center rounded-2xl border-[3px] bg-panel',
            invalid ? 'border-punch' : 'border-edge',
          )}
          style={{ boxShadow: '0 5px 0 var(--color-ink)' }}
        >
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Room length"
            value={amount}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => commitAmount(event.target.value)}
            // Back to showing the value, which may have been clamped.
            onBlur={() => setDraft(null)}
            className="arcade-focus h-12 w-20 rounded-xl border-0 bg-transparent text-right font-display text-3xl font-bold tabular-nums text-cream outline-none"
          />
          <span className="ml-2 w-14 font-display text-sm font-bold uppercase tracking-[1px] text-bone-faint">
            {UNITS.find((option) => option.id === unit)?.label}
          </span>
        </div>

        <NudgeButton
          label={`${formatLength(step)} longer`}
          disabled={minutes >= CEILING_MINUTES}
          onClick={() => nudge(1)}
        >
          +
        </NudgeButton>
      </div>

      {/* Which unit the number counts in. Three equal segments across the full
          width, at the same weight as every other picker in the product. */}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Count the length in">
        {UNITS.map((option) => {
          const active = option.id === unit;

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => switchUnit(option.id)}
              className={cn(
                'arcade-focus h-11 rounded-[14px] border-[3px] font-display text-[13px] font-bold uppercase tracking-[1px] transition-colors',
                active
                  ? 'border-sun bg-sun/20 text-cream'
                  : 'border-white/16 bg-white/6 text-bone hover:bg-white/12',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/*
        The length as it will read, and the clock time it lands on. The wall
        clock is what players see, and someone setting a four-hour round
        deserves to notice it finishes after midnight before they create it.
      */}
      <output
        aria-live="polite"
        className="text-center text-[12px] font-extrabold text-bone-faint"
      >
        {formatLength(minutes)} · ends{' '}
        {formatClock(new Date(startOfMinute(now) + minutes * 60_000), now)}
      </output>
    </div>
  );
}

function NudgeButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="arcade-focus flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-[3px] border-white/16 bg-white/6 font-display text-2xl font-bold text-bone transition-colors hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * How far `value` is from `now`, in whole minutes.
 *
 * A `YYYY-MM-DDTHH:mm` string with no zone is parsed as local wall clock, which
 * is what the rest of the form assumes too. An unparseable value falls back to
 * the default preset rather than `NaN`, so a cleared field shows a sensible
 * length instead of "NaN min".
 */
function minutesFromNow(value: string, now: number): number {
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return DEFAULT_MINUTES;

  /*
    Measured from the top of the current minute, not from `now` itself.

    The value is a `YYYY-MM-DDTHH:mm` string, so writing it throws the seconds
    away. Pressing "30 min" at 12:00:31 stored 12:30, which is 29 and a half
    minutes from the instant the button was pressed — and read back as 29. The
    control said one thing and reported another the moment it was touched. It
    also means the countdown falls in whole minutes rather than flickering
    between two of them.
  */
  return Math.round((at - startOfMinute(now)) / 60_000);
}

/** `now` with the seconds and milliseconds cut off. */
function startOfMinute(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000;
}

/** `45 min`, `1h 30m`, `2 hours`, `1d 6h`, `3 days`. */
function formatLength(minutes: number): string {
  if (minutes < HOUR) return `${minutes} min`;

  if (minutes < DAY) {
    const hours = Math.floor(minutes / HOUR);
    const rest = minutes % HOUR;
    if (rest === 0) return hours === 1 ? '1 hour' : `${hours} hours`;
    return `${hours}h ${rest}m`;
  }

  /*
    Days carry their remaining hours.

    Rounding to whole days reported a day and a half as "2 days" and showed no
    change at all while the stepper moved through it — the readout has to name
    the value that was actually picked.
  */
  let days = Math.floor(minutes / DAY);
  let hours = Math.round((minutes % DAY) / HOUR);
  // A remainder within half an hour of a full day rounds up into one.
  if (hours === 24) {
    days += 1;
    hours = 0;
  }

  if (hours === 0) return days === 1 ? '1 day' : `${days} days`;
  return `${days}d ${hours}h`;
}

/**
 * The wall-clock time, and the weekday when it is not today.
 *
 * "ends 09:15" is ambiguous once a round runs overnight, and a four-hour round
 * started in the evening does. Naming the day only when it differs keeps the
 * common case short.
 *
 * "Today" is measured against the `now` the field was given, not against the
 * real clock. The whole component takes `now` as a prop so that what it shows
 * is a function of its inputs; reading `new Date()` here meant a field whose
 * `now` came from anywhere else — a server clock, a page left open across
 * midnight — decided the question against a different day than the one it was
 * doing its arithmetic in.
 */
function formatClock(at: Date, now: number): string {
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const isToday = at.toDateString() === new Date(now).toDateString();

  return isToday ? time : `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}
