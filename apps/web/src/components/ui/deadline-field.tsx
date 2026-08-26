'use client';

import { CHALLENGE_MIN_MINUTES } from '@bb/shared';
import { useMemo } from 'react';

import { toLocalInputValue } from '@/components/ui/date-time-field';
import { cn } from '@/lib/utils';

/**
 * How long the room runs for.
 *
 * This replaced a full date-and-time picker, which was the wrong instrument for
 * the question. A room deadline is minutes or hours from now — the field's own
 * hint says "any time from 5 minutes out" — and the picker it inherited opened a
 * month grid with arrows for paging through months and years. Nobody has ever
 * scheduled a room for March. Reaching "in two hours" meant opening a calendar,
 * confirming today is still today, and then nudging a clock.
 *
 * So the control asks the question the host is actually answering: how long do
 * players get? Four presets cover almost every round in one press, and the
 * stepper beside them handles the rest without a popover, a grid, or a concept
 * of months existing at all.
 *
 * The value stays `YYYY-MM-DDTHH:mm` local wall clock, unchanged, so the form
 * around it and the server contract both stay exactly as they were.
 */

/** The four lengths a round actually gets set to, in minutes. */
const PRESETS = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
];

/** Half an hour, which is a typical round and what the form already opened on. */
const DEFAULT_MINUTES = 30;

/*
  Five-minute steps, matching the picker this replaced.

  A modelling deadline is not a meaningful thing to set to the minute, and the
  step is what makes the control reachable in a couple of presses rather than a
  dozen.
*/
const STEP_MINUTES = 5;

/*
  The server's own floor, not a second copy of it.

  The API rejects anything closer than this, so a control that let you pick 3
  minutes would be offering a value it knows will bounce.
*/
const FLOOR_MINUTES = CHALLENGE_MIN_MINUTES;

/** A week out. Past this it is not a room, it is a challenge. */
const CEILING_MINUTES = 7 * 24 * 60;

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
  const nudge = (delta: number) => {
    const snapped = Math.round(minutes / STEP_MINUTES) * STEP_MINUTES;
    set(snapped + delta);
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRESETS.map((preset) => {
          // Within half a step counts as "this one", so a preset stays lit after
          // the clock ticks a minute underneath it.
          const active = Math.abs(minutes - preset.minutes) < STEP_MINUTES / 2;

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
          label={`${STEP_MINUTES} minutes shorter`}
          disabled={minutes <= FLOOR_MINUTES}
          onClick={() => nudge(-STEP_MINUTES)}
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
            ends {formatClock(new Date(now + minutes * 60_000))}
          </span>
        </output>

        <NudgeButton
          label={`${STEP_MINUTES} minutes longer`}
          disabled={minutes >= CEILING_MINUTES}
          onClick={() => nudge(STEP_MINUTES)}
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

/** `45 min`, `1h 30m`, `2 hours`, `3 days`. */
function formatLength(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;

  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (rest === 0) return hours === 1 ? '1 hour' : `${hours} hours`;
    return `${hours}h ${rest}m`;
  }

  const days = Math.round(minutes / (24 * 60));
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * The wall-clock time, and the weekday when it is not today.
 *
 * "ends 09:15" is ambiguous once a round runs overnight, and a four-hour round
 * started in the evening does. Naming the day only when it differs keeps the
 * common case short.
 */
function formatClock(at: Date): string {
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const isToday = at.toDateString() === new Date().toDateString();

  return isToday ? time : `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}
