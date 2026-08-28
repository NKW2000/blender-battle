'use client';

import { CHALLENGE_MIN_MINUTES } from '@bb/shared';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { toLocalInputValue } from '@/components/ui/date-time-field';
import { cn } from '@/lib/utils';

/**
 * How long the room runs for, set the way an alarm is set.
 *
 * Three wheels — days, hours, minutes — with the selected row held in a lit band
 * across the middle. It replaced a row of preset chips, a stepper and a unit
 * toggle, which between them could reach any length but only by pressing at one
 * repeatedly, and which had to keep explaining to the reader which unit the
 * number in the box was counting in. Wheels do not have that problem: every
 * column is labelled, all three are visible at once, and the length is read off
 * them the way it is read off a clock.
 *
 * The value stays `YYYY-MM-DDTHH:mm` local wall clock, unchanged, so the form
 * around it and the server contract both stay exactly as they were.
 */

const HOUR = 60;
const DAY = 24 * HOUR;

/*
  The server's own floor, not a second copy of it.

  The API rejects anything closer than this, so a control that let you pick 3
  minutes would be offering a value it knows will bounce.
*/
const FLOOR_MINUTES = CHALLENGE_MIN_MINUTES;

/** A week out. Past this it is not a room, it is a challenge. */
const CEILING_MINUTES = 7 * DAY;

/** Half an hour, which is a typical round and what the form already opened on. */
const DEFAULT_MINUTES = 30;

/*
  One row, and the five that are visible at a time.

  Five is two either side of the selection, which is enough to show that the
  column keeps going without turning the field into a list.
*/
const ROW = 44;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ROW;

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

const DAYS = range(8);
const HOURS = range(24);
/* Every minute, not every fifth. A room set to 47 minutes has to be able to say
   so — rounding the column to fives would make the wheel disagree with the
   value the moment anything else set one. */
const MINUTES = range(60);

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

  const days = Math.floor(minutes / DAY);
  const hours = Math.floor((minutes % DAY) / HOUR);
  const mins = minutes % HOUR;

  const set = (nextDays: number, nextHours: number, nextMinutes: number) => {
    const total = nextDays * DAY + nextHours * HOUR + nextMinutes;
    const clamped = Math.min(CEILING_MINUTES, Math.max(FLOOR_MINUTES, total));
    onChange(toLocalInputValue(new Date(startOfMinute(now) + clamped * 60_000)));
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-[20px] border-[3px] bg-panel',
          invalid ? 'border-punch' : 'border-edge',
        )}
        style={{ boxShadow: '0 5px 0 var(--color-ink)' }}
      >
        {/*
          The headings sit above the wheels rather than inside them.

          The lit band is positioned from the top of the row it belongs to, and
          while each column carried its own heading that row started lower than
          the band was measured against — the band floated between two numbers
          instead of holding one.
        */}
        <div aria-hidden="true" className="flex px-2 pb-1 pt-3">
          {['Days', 'Hours', 'Minutes'].map((heading) => (
            <p
              key={heading}
              className="flex-1 text-center text-[10px] font-black uppercase tracking-[1.5px] text-bone-faint"
            >
              {heading}
            </p>
          ))}
        </div>

        <div className="relative flex">
          {/*
            The lit band the selection sits in, drawn once across all three
            columns rather than per wheel, so the three numbers read as one
            length. It is behind the wheels and takes no pointer events, so a
            press lands on the row underneath it.
          */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2 z-0 rounded-[14px] border-[3px] border-sun bg-sun/16"
            style={{ top: PAD, height: ROW }}
          />

          <Wheel label="Days" values={DAYS} value={days} onSelect={(d) => set(d, hours, mins)} />
          <Wheel label="Hours" values={HOURS} value={hours} onSelect={(h) => set(days, h, mins)} />
          <Wheel label="Minutes" values={MINUTES} value={mins} onSelect={(m) => set(days, hours, m)} />
        </div>

        {/*
          The columns fade out at top and bottom so the numbers leaving the
          window read as continuing rather than being cut off.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-11"
          style={{ background: 'linear-gradient(var(--color-panel), transparent)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-11"
          style={{ background: 'linear-gradient(transparent, var(--color-panel))' }}
        />
      </div>

      {/*
        The length as it will read, and the clock time it lands on. The wall
        clock is what players see, and someone setting a four-hour round
        deserves to notice it finishes after midnight before they create it.
      */}
      <output aria-live="polite" className="text-center text-[12px] font-extrabold text-bone-faint">
        {formatLength(minutes)} · ends{' '}
        {formatClock(new Date(startOfMinute(now) + minutes * 60_000), now)}
      </output>
    </div>
  );
}

/**
 * One column of the picker.
 *
 * A listbox rather than a bare scroller. The wheel is driven by scrolling, which
 * a mouse and a finger both do naturally and neither a keyboard nor a screen
 * reader can do at all — so the same column also answers arrow keys, Home and
 * End, and every row is a target you can simply press.
 */
function Wheel({
  label,
  values,
  value,
  onSelect,
}: {
  label: string;
  values: number[];
  value: number;
  onSelect: (value: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const index = Math.max(0, values.indexOf(value));

  /*
    Follow the value when something else moves it, including the clamp.

    A layout effect, and asserted again on the next frame. Setting `scrollTop`
    before the rows have been laid out clamps it to whatever the column's height
    is at that moment — on the first paint that put every wheel near the top,
    so a room of an hour and a half opened showing zero and three.
  */
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const top = index * ROW;

    const place = () => {
      if (Math.abs(element.scrollTop - top) < 2) return;
      // Assigned rather than `scrollTo({ behavior: 'auto' })`, which is the same
      // jump and is not implemented everywhere this component is rendered.
      element.scrollTop = top;
    };

    place();

    /*
      No guard against this scroll being read back as a choice.

      There was one — a flag cleared a frame later — and it was the reason the
      wheel stopped responding: the effect's own cleanup could cancel the frame
      that cleared it, leaving it set for good and every real scroll ignored.
      It was never needed. A scroll this causes lands on the value that is
      already set, and the handler below only reports a change.
    */
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [index]);

  // Nothing left pending when the wheel goes away.
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  const onScroll = () => {
    const element = ref.current;
    if (!element) return;

    if (settle.current) clearTimeout(settle.current);
    /*
      Read once the wheel has come to rest.

      A scroll fires continuously, and committing on every frame would emit a
      value for each number the column passed through — filling the form's
      history and, on a long flick, rewriting the deadline dozens of times.
    */
    settle.current = setTimeout(() => {
      const landed = Math.round(element.scrollTop / ROW);
      const next = values[Math.min(values.length - 1, Math.max(0, landed))];
      if (next !== undefined && next !== value) onSelect(next);
    }, 110);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const move = (to: number) => {
      event.preventDefault();
      const next = values[Math.min(values.length - 1, Math.max(0, to))];
      if (next !== undefined) onSelect(next);
    };

    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(values.length - 1);
  };

  return (
    <div className="relative z-10 min-w-0 flex-1">
      <div
        ref={ref}
        role="listbox"
        aria-label={label}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        className="arcade-focus no-scrollbar overflow-y-auto rounded-[14px] outline-none"
        style={{
          height: VISIBLE * ROW,
          paddingTop: PAD,
          paddingBottom: PAD,
          scrollSnapType: 'y mandatory',
          /*
            Instant, against the app-wide rule.

            The stylesheet gives every `.overflow-y-auto` smooth scrolling, which
            is right for a nav strip and wrong for a picker: it turned each
            placement into a half-second animation, so the wheel opened part-way
            to its value and the handler below read a position the wheel was
            still travelling through. Inline, so it beats the class rule.
          */
          scrollBehavior: 'auto',
        }}
      >
        {values.map((option) => {
          const selected = option === value;

          return (
            <div
              key={option}
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(option)}
              className={cn(
                'flex cursor-pointer items-center justify-center font-display tabular-nums transition-colors',
                selected ? 'text-2xl font-bold text-cream' : 'text-xl font-bold text-bone-faint',
              )}
              style={{ height: ROW, scrollSnapAlign: 'center' }}
            >
              {option}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * How far `value` is from `now`, in whole minutes.
 *
 * A `YYYY-MM-DDTHH:mm` string with no zone is parsed as local wall clock, which
 * is what the rest of the form assumes too. An unparseable value falls back to
 * the default rather than `NaN`, so a cleared field shows a sensible length
 * instead of every wheel reading zero.
 */
function minutesFromNow(value: string, now: number): number {
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return DEFAULT_MINUTES;

  /*
    Measured from the top of the current minute, not from `now` itself.

    The value is a `YYYY-MM-DDTHH:mm` string, so writing it throws the seconds
    away. Setting thirty minutes at 12:00:31 stored 12:30, which is twenty-nine
    and a half minutes from the instant it was set — and read back as 29. The
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

  const days = Math.floor(minutes / DAY);
  const hours = Math.round((minutes % DAY) / HOUR);

  // A remainder within half an hour of a full day rounds up into one.
  if (hours === 24) return `${days + 1} days`;
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
