'use client';

import { CHALLENGE_MIN_MINUTES } from '@bb/shared';
import { useMemo } from 'react';

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

  const set = (nextMinutes: number) => {
    const clamped = Math.min(CEILING_MINUTES, Math.max(FLOOR_MINUTES, nextMinutes));
    onChange(toLocalInputValue(new Date(now + clamped * 60_000)));
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
              onClick={() => set(preset.minutes)}
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

      <div className="flex items-center gap-2">
        <NudgeButton
          label={`${formatLength(step)} shorter`}
          disabled={minutes <= FLOOR_MINUTES}
          onClick={() => nudge(-1)}
        >
          −
        </NudgeButton>

        {/*
          The readout states the length and the clock time it lands on. The
          length is what is being chosen; the wall-clock time is what players
          will see, and someone setting a four-hour round deserves to notice it
          finishes after midnight before they create it.
        */}
        <output
          aria-live="polite"
          aria-label="Room length"
          className={cn(
            'flex h-14 flex-1 flex-col items-center justify-center rounded-2xl border-[3px] bg-white/6',
            invalid ? 'border-punch' : 'border-white/16',
          )}
        >
          <span className="font-display text-lg font-bold leading-none text-bone">
            {formatLength(minutes)}
          </span>
          <span className="mt-1 text-[11px] font-extrabold leading-none text-bone-faint">
            ends {formatClock(new Date(now + minutes * 60_000), now)}
          </span>
        </output>

        <NudgeButton
          label={`${formatLength(step)} longer`}
          disabled={minutes >= CEILING_MINUTES}
          onClick={() => nudge(1)}
        >
          +
        </NudgeButton>
      </div>
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

  return Math.round((at - now) / 60_000);
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
