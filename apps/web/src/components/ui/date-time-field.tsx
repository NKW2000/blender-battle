'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ChevronIcon } from '@/components/ui/icons';
import { UI_LOCALE, cn } from '@/lib/utils';

/**
 * The arcade date-and-time picker.
 *
 * A native `<input type="datetime-local">` is replaced wholesale for the same
 * reason `Select` replaces `<select>`: the parts that looked wrong — the
 * segmented mm/dd/yyyy editor, the calendar indicator glyph, and the dropdown
 * calendar itself — are drawn by the browser and cannot be reached by CSS. Only
 * a custom control can carry the ink borders, hard shadows and sun-yellow
 * selection the rest of the language uses.
 *
 * Date and time are two separate fields over one value. They are picked in
 * different ways — a month grid versus a pair of steppers — and pairing them in
 * a single popover meant opening a calendar to nudge a clock by five minutes.
 *
 * Time uses steppers rather than dropdowns: a dropdown would have been a popover
 * inside a popover, and the steppers match the player-count control the same
 * form already uses.
 *
 * The value is a local wall-clock string (`YYYY-MM-DDTHH:mm`), byte-identical to
 * what the native input produced, so call sites convert it to a UTC instant the
 * same way they always did.
 */

/** `YYYY-MM-DDTHH:mm` in the browser's own timezone. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalInputValue(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Leading blanks then every day of the month, padded to whole weeks. */
function monthGrid(year: number, month: number): (Date | null)[] {
  const cells: (Date | null)[] = [];
  const lead = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();

  for (let index = 0; index < lead; index += 1) cells.push(null);
  for (let day = 1; day <= days; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Minutes move in fives. A modelling deadline is not a meaningful thing to set
 * to the minute, and the step is what makes the control reachable in a couple of
 * presses rather than a dozen.
 */
const MINUTE_STEP = 5;

type OpenPart = 'date' | 'time' | null;

export function DateTimeField({
  value,
  onChange,
  ariaLabel,
  invalid = false,
  minDate,
  maxDate,
  className,
}: {
  /** `YYYY-MM-DDTHH:mm`, local wall clock. */
  value: string;
  onChange: (value: string) => void;
  /** Prefixes both fields, e.g. "Ends at" → "Ends at date" / "Ends at time". */
  ariaLabel: string;
  invalid?: boolean;
  /** Days entirely before this are not selectable. */
  minDate?: Date;
  /** Days entirely after this are not selectable. */
  maxDate?: Date;
  className?: string;
}) {
  // One at a time: opening either closes the other, so two panels can never
  // overlap each other on a narrow screen.
  const [openPart, setOpenPart] = useState<OpenPart>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const selected = parseLocalInputValue(value);

  // Which month the calendar is showing, which is not the same as the selected
  // day — you can page to November without picking anything in it.
  const [viewMonth, setViewMonth] = useState(() => {
    const base = selected ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  // Re-open on the selected month rather than wherever the user last paged to.
  useEffect(() => {
    const next = parseLocalInputValue(value);
    if (openPart === 'date' && next) {
      setViewMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    }
  }, [openPart, value]);

  useEffect(() => {
    if (!openPart) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenPart(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Stops here rather than bubbling to the dialog this usually sits in —
      // Escape should shut the panel first, not the whole form behind it.
      event.stopPropagation();
      event.preventDefault();
      setOpenPart(null);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [openPart]);

  /*
    The value lives in the parent, so a stepper cannot use a functional state
    update to build on its own previous result. Two presses inside one frame
    would both read the value from the render they were painted in and emit the
    same instant, and holding the + button would move the clock one notch
    instead of ten. This ref carries the latest emitted value forward so
    consecutive presses chain, and re-syncs whenever the parent sends a new one.
  */
  const latestRef = useRef(value);
  useEffect(() => {
    latestRef.current = value;
  }, [value]);

  const current = () => parseLocalInputValue(latestRef.current) ?? new Date();

  const emit = (next: Date) => {
    latestRef.current = toLocalInputValue(next);
    onChange(latestRef.current);
  };

  const toggle = (part: Exclude<OpenPart, null>) =>
    setOpenPart((open) => (open === part ? null : part));

  /** Keeps the time, moves the day. */
  const pickDay = (day: Date) => {
    const base = current();
    emit(
      new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        base.getHours(),
        base.getMinutes(),
      ),
    );
  };

  const shiftHours = (direction: 1 | -1) => {
    const next = current();
    next.setHours(next.getHours() + direction);
    emit(next);
  };

  /**
   * Steps to the next multiple of five rather than adding five to whatever odd
   * minute is there, so the value settles onto the grid instead of drifting
   * along at `:19`, `:24`, `:29`. Date arithmetic carries the hour, and the day
   * with it, on its own.
   */
  const shiftMinutes = (direction: 1 | -1) => {
    const next = current();
    const raw = next.getMinutes();
    next.setMinutes(
      direction > 0
        ? (Math.floor(raw / MINUTE_STEP) + 1) * MINUTE_STEP
        : (Math.ceil(raw / MINUTE_STEP) - 1) * MINUTE_STEP,
    );
    emit(next);
  };

  const dayDisabled = (day: Date) => {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
    if (minDate && end < minDate) return true;
    if (maxDate && start > maxDate) return true;
    return false;
  };

  const cells = monthGrid(viewMonth.getFullYear(), viewMonth.getMonth());
  /*
    The same cells, grouped into weeks.

    Needed because `role="grid"` requires `role="row"` between the grid and its
    cells. The flat list still drives the arrow-key navigation, which indexes
    into it by ±1 and ±7 — splitting it there too would mean two representations
    of the same month that could disagree.
  */
  const weeks = Array.from({ length: cells.length / 7 }, (_, week) =>
    cells.slice(week * 7, week * 7 + 7),
  );
  const today = new Date();
  const shown = selected ?? today;

  // Arrow keys walk the grid a day or a week at a time, as a native calendar
  // does. Selection follows focus, so there is nothing extra to commit.
  const onGridKeyDown = (event: React.KeyboardEvent) => {
    const step =
      event.key === 'ArrowLeft'
        ? -1
        : event.key === 'ArrowRight'
          ? 1
          : event.key === 'ArrowUp'
            ? -7
            : event.key === 'ArrowDown'
              ? 7
              : 0;
    if (!step || !selected) return;

    event.preventDefault();
    const next = new Date(selected);
    next.setDate(next.getDate() + step);
    if (dayDisabled(next)) return;

    setViewMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    pickDay(next);
    // The moved-to day owns the roving tabindex, so focus has to follow it.
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    });
  };

  return (
    <div ref={rootRef} className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', className)}>
      <div className="relative">
        <FieldTrigger
          ariaLabel={`${ariaLabel} date`}
          open={openPart === 'date'}
          invalid={invalid}
          accent="aqua"
          eyebrow={selected ? selected.toLocaleDateString(UI_LOCALE, { weekday: 'long' }) : 'Date'}
          display={
            selected
              ? selected.toLocaleDateString(UI_LOCALE, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Pick a date'
          }
          muted={!selected}
          glyph={<CalendarGlyph />}
          onToggle={() => toggle('date')}
        />

        {openPart === 'date' ? (
          <Popover ariaLabel={`${ariaLabel} date`} className="w-[330px]">
            <div className="flex items-center justify-between gap-2">
              <NudgeButton
                label="Previous month"
                onClick={() =>
                  setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
                }
              >
                <ChevronIcon direction="left" size={16} />
              </NudgeButton>
              <span aria-live="polite" className="font-display text-base font-bold text-cream">
                {viewMonth.toLocaleDateString(UI_LOCALE, { month: 'long', year: 'numeric' })}
              </span>
              <NudgeButton
                label="Next month"
                onClick={() =>
                  setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
                }
              >
                <ChevronIcon direction="right" size={16} />
              </NudgeButton>
            </div>

            <div aria-hidden="true" className="mt-3 grid grid-cols-7 gap-1">
              {WEEKDAY_INITIALS.map((initial, index) => (
                <span
                  key={index}
                  className="flex h-6 items-center justify-center text-[11px] font-black uppercase tracking-wider text-aqua/70"
                >
                  {initial}
                </span>
              ))}
            </div>

            {/*
              `role="grid"` requires rows.

              The cells were emitted straight into the grid container, which is
              an invalid structure: a `gridcell` must have a `row` ancestor, and
              without one assistive technology cannot report "week 3, Tuesday"
              or navigate by row at all — some implementations drop the grid
              semantics entirely and read forty-two loose buttons.

              The CSS grid is unchanged; `display: contents` lets each row carry
              the semantics without becoming a layout box that would break the
              seven-column track.
            */}
            <div
              ref={gridRef}
              role="grid"
              aria-label="Calendar"
              onKeyDown={onGridKeyDown}
              className="mt-1 grid grid-cols-7 gap-1"
            >
              {weeks.map((week, weekIndex) => (
                <div role="row" key={`week-${weekIndex}`} style={{ display: 'contents' }}>
                  {week.map((day, index) => {
                    if (!day) return <span key={`pad-${weekIndex}-${index}`} className="h-10" />;

                    const isSelected = Boolean(selected && sameDay(day, selected));
                    const isToday = sameDay(day, today);
                    const disabled = dayDisabled(day);

                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        role="gridcell"
                        aria-selected={isSelected}
                        aria-label={day.toLocaleDateString(UI_LOCALE, {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                        })}
                        disabled={disabled}
                        // Roving tabindex: one stop for the grid, not forty-two.
                        tabIndex={isSelected ? 0 : -1}
                        onClick={() => pickDay(day)}
                        className={cn(
                          'arcade-focus relative flex h-10 items-center justify-center rounded-xl font-display text-sm font-bold transition-colors',
                          isSelected
                            ? 'border-2 border-ink bg-sun text-ink'
                            : 'text-bone hover:bg-white/12',
                          disabled && 'cursor-not-allowed opacity-20 hover:bg-transparent',
                        )}
                        style={isSelected ? { boxShadow: '0 3px 0 var(--color-ink)' } : undefined}
                      >
                        {day.getDate()}
                        {isToday && !isSelected ? (
                          <span
                            aria-hidden="true"
                            className="absolute bottom-1.5 h-1 w-1 rounded-full bg-aqua"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <PopoverFooter onDone={() => setOpenPart(null)}>
              {selected
                ? selected.toLocaleDateString(UI_LOCALE, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                : '—'}
            </PopoverFooter>
          </Popover>
        ) : null}
      </div>

      <div className="relative">
        <FieldTrigger
          ariaLabel={`${ariaLabel} time`}
          open={openPart === 'time'}
          invalid={invalid}
          accent="sun"
          eyebrow="Time"
          display={
            selected
              ? selected.toLocaleTimeString(UI_LOCALE, { hour: 'numeric', minute: '2-digit' })
              : 'Pick a time'
          }
          muted={!selected}
          glyph={<ClockGlyph />}
          onToggle={() => toggle('time')}
        />

        {openPart === 'time' ? (
          <Popover ariaLabel={`${ariaLabel} time`} className="w-[290px]">
            <div className="flex items-center gap-2">
              <TimeStepper
                unit="Hour"
                display={String(shown.getHours()).padStart(2, '0')}
                onDown={() => shiftHours(-1)}
                onUp={() => shiftHours(1)}
              />
              <span aria-hidden="true" className="font-display text-2xl font-bold text-bone-faint">
                :
              </span>
              <TimeStepper
                unit="Minute"
                display={String(shown.getMinutes()).padStart(2, '0')}
                onDown={() => shiftMinutes(-1)}
                onUp={() => shiftMinutes(1)}
              />
            </div>

            <p className="mt-2 text-center text-[11px] font-extrabold text-bone-faint">
              24-hour clock · minutes in {MINUTE_STEP}s
            </p>

            <PopoverFooter onDone={() => setOpenPart(null)}>
              {selected
                ? selected.toLocaleTimeString(UI_LOCALE, { hour: 'numeric', minute: '2-digit' })
                : '—'}
            </PopoverFooter>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}

/** The shared look of both fields: glyph tile, eyebrow, value, chevron. */
function FieldTrigger({
  ariaLabel,
  open,
  invalid,
  accent,
  eyebrow,
  display,
  muted,
  glyph,
  onToggle,
}: {
  ariaLabel: string;
  open: boolean;
  invalid: boolean;
  accent: 'aqua' | 'sun';
  eyebrow: string;
  display: string;
  muted: boolean;
  glyph: React.ReactNode;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' && !open) {
          event.preventDefault();
          onToggle();
        }
      }}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={ariaLabel}
      className={cn(
        'arcade-focus flex h-16 w-full items-center gap-3 rounded-2xl border-[3px] px-3 text-left transition-colors',
        invalid
          ? 'border-punch/70 bg-punch/10'
          : open
            ? 'border-select bg-select/10'
            : 'border-white/16 bg-white/6 hover:bg-white/10',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 transition-colors',
          invalid
            ? 'border-punch/40 bg-punch/15 text-punch-soft'
            : accent === 'aqua'
              ? 'border-aqua/35 bg-aqua/12 text-aqua'
              : 'border-sun/40 bg-sun/12 text-sun',
        )}
      >
        {glyph}
      </span>

      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[11px] font-black uppercase tracking-[0.14em] text-bone-faint">
          {eyebrow}
        </span>
        <span
          className={cn(
            'truncate font-display text-lg font-bold',
            muted ? 'text-bone-faint' : 'text-bone',
          )}
        >
          {display}
        </span>
      </span>

      <span className="ml-auto shrink-0">
        <Chevron open={open} />
      </span>
    </button>
  );
}

/**
 * The panel both fields drop, matching `Select`'s listbox construction.
 *
 * It centres on its field and flips above it when there is not enough room
 * below. The deadline sits near the foot of the create-room dialog, so a panel
 * that only ever opened downward ran off the bottom of the window and had to be
 * scrolled to — and the page behind a modal is deliberately frozen, so that
 * scroll was not always even available.
 *
 * Positioning lives on the outer element and the pop animation on the inner one:
 * both want the `transform` property, and sharing it would mean the keyframes
 * wiping out the centring on their first frame.
 */
function Popover({
  ariaLabel,
  className,
  children,
}: {
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  // Nudge off dead centre when centring alone would push the panel off-screen.
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const anchor = panel?.parentElement?.parentElement;
    if (!panel || !anchor) return;

    const place = () => {
      const box = anchor.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = panel;
      const gap = 8;
      const margin = 8;

      const below = window.innerHeight - box.bottom - gap;
      const above = box.top - gap;
      // Only flip when below genuinely cannot hold it and above is roomier —
      // otherwise the panel jumps sides for no visible gain.
      setPlacement(below < height && above > below ? 'above' : 'below');

      const centred = box.left + box.width / 2 - width / 2;
      const clamped = Math.min(
        Math.max(centred, margin),
        Math.max(margin, window.innerWidth - width - margin),
      );
      setShift(clamped - centred);
    };

    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  return (
    <div
      className={cn(
        'absolute left-1/2 z-50',
        placement === 'above' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]',
      )}
      style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-label={ariaLabel}
        className={cn(
          'max-h-[calc(100vh-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[20px] border-4 border-edge bg-panel-raised p-4',
          className,
        )}
        style={{ boxShadow: '0 10px 0 var(--color-edge)', animation: 'bbPop .16s ease both' }}
      >
        {children}
      </div>
    </div>
  );
}

function PopoverFooter({
  children,
  onDone,
}: {
  children: React.ReactNode;
  onDone: () => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t-2 border-white/10 pt-3">
      <span className="min-w-0 truncate font-display text-sm font-bold text-cream">{children}</span>
      <button
        type="button"
        onClick={onDone}
        className="arcade-press arcade-focus shrink-0 rounded-xl border-[3px] border-ink bg-cream px-5 py-2 font-display text-sm font-bold text-ink [--press-depth:3px]"
        style={{ boxShadow: '0 3px 0 var(--color-ink)' }}
      >
        Done
      </button>
    </div>
  );
}

/** One −/+ pair around a big number, matching the player-count stepper. */
function TimeStepper({
  unit,
  display,
  onDown,
  onUp,
}: {
  unit: string;
  display: string;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <div className="flex flex-1 items-center gap-1.5">
      <NudgeButton label={`${unit} down`} onClick={onDown}>
        −
      </NudgeButton>
      <output
        aria-live="polite"
        aria-label={unit}
        className="flex h-11 flex-1 items-center justify-center rounded-xl border-2 border-white/16 bg-white/6 font-display text-xl font-bold tabular-nums text-bone"
      >
        {display}
      </output>
      <NudgeButton label={`${unit} up`} onClick={onUp}>
        +
      </NudgeButton>
    </div>
  );
}

/** The small chunky square used for month paging and time stepping. */
function NudgeButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="arcade-press arcade-focus flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-ink bg-cream font-display text-lg font-bold leading-none text-ink [--press-depth:2px]"
      style={{ boxShadow: '0 2px 0 var(--color-ink)' }}
    >
      {children}
    </button>
  );
}

function CalendarGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2.4" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-bone-muted transition-transform"
      style={{ transform: open ? 'rotate(180deg)' : 'none' }}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
