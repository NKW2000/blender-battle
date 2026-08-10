'use client';

import { useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import { UI_LOCALE } from '@/lib/utils';
import {
  PANEL_ICON,
  Panel,
  PanelBody,
  PanelHeader,
  PanelTile,
  PanelTitle,
} from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import {
  useCloseEvent,
  useEvent,
  useScheduleEvent,
  useUnscheduleEvent,
} from '@/features/challenges/use-events';

type Unit = 'hours' | 'days';

const UNIT_OPTIONS = [
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
];

/** A local datetime value (yyyy-MM-ddThh:mm) an hour from now, for the default. */
function defaultStart(): string {
  const at = new Date(Date.now() + 60 * 60 * 1000);
  at.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

const toHours = (value: number, unit: Unit) => (unit === 'days' ? value * 24 : value);

/**
 * Manager control for turning a published challenge into a timed public event,
 * or adjusting one.
 *
 * The two windows are entered as a number plus a Hours/Days unit — the request
 * carries hours, and the server derives the submission and vote deadlines so
 * they can never be set out of order. Once anyone has entered, the schedule
 * locks; the server enforces that too, this only hides the controls.
 */
export function ScheduleEventPanel({ challengeId }: { challengeId: string }) {
  const { data: event } = useEvent(challengeId);
  const schedule = useScheduleEvent(challengeId);
  const unschedule = useUnscheduleEvent(challengeId);
  const close = useCloseEvent(challengeId);

  const [startLocal, setStartLocal] = useState(defaultStart);
  const [submitValue, setSubmitValue] = useState(2);
  const [submitUnit, setSubmitUnit] = useState<Unit>('days');
  const [voteValue, setVoteValue] = useState(1);
  const [voteUnit, setVoteUnit] = useState<Unit>('days');

  const phase = event?.phase ?? 'not-an-event';
  const isScheduled = phase !== 'not-an-event';
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(UI_LOCALE) : '—');

  const submit = () => {
    schedule.mutate({
      // datetime-local has no zone; interpret it in the organiser's own zone.
      startDate: new Date(startLocal).toISOString(),
      submitHours: toHours(submitValue, submitUnit),
      voteHours: toHours(voteValue, voteUnit),
    });
  };

  return (
    <Panel>
      <PanelHeader tone="aqua" icon={PANEL_ICON.calendar}>
        <PanelTitle>Public event schedule</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-5">
        {isScheduled ? (
          /*
            Four tiles rather than four rows in a flat box.

            These are the same kind of fact the brief shows as stats — a label
            and a value — and they were the one part of this screen still drawn
            in the old language: a thin 2px border, no shadow, no tile. Reusing
            `PanelTile` is what makes the schedule look like it belongs to the
            same application as the brief sitting under it.
          */
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ScheduleFact label="Status" value={phase} accent />
            <ScheduleFact label="Opens" value={fmt(event?.startDate ?? null)} />
            <ScheduleFact label="Submissions close" value={fmt(event?.endDate ?? null)} />
            <ScheduleFact label="Voting closes" value={fmt(event?.votingEndsAt ?? null)} />
          </div>
        ) : (
          <p className="text-sm font-extrabold text-bone-muted">
            Schedule this brief as an open competition. Everyone enters before the deadline, then
            votes for a winner. The vote closes on its own at the time you set.
          </p>
        )}

        {phase === 'not-an-event' || phase === 'upcoming' ? (
          <div className="flex flex-col gap-4">
            <label className="block">
              <span className="eyebrow text-aqua">Starts</span>
              <input
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                className="arcade-focus mt-2 w-full rounded-xl border-[3px] border-ink bg-white/6 px-4 py-3 font-bold text-cream"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <span className="eyebrow text-aqua">Submission window</span>
                <div className="mt-2 flex gap-2">
                  <input
                    type="number"
                    min={1}
                    value={submitValue}
                    onChange={(e) => setSubmitValue(Math.max(1, Number(e.target.value)))}
                    className="arcade-focus h-11 w-20 rounded-2xl border-[3px] border-ink bg-white/6 px-3 font-bold text-cream"
                  />
                  <Select
                    className="flex-1"
                    ariaLabel="Submission unit"
                    value={submitUnit}
                    onChange={(v) => setSubmitUnit(v as Unit)}
                    options={UNIT_OPTIONS}
                  />
                </div>
              </div>

              <div>
                <span className="eyebrow text-aqua">Voting window</span>
                <div className="mt-2 flex gap-2">
                  <input
                    type="number"
                    min={1}
                    value={voteValue}
                    onChange={(e) => setVoteValue(Math.max(1, Number(e.target.value)))}
                    className="arcade-focus h-11 w-20 rounded-2xl border-[3px] border-ink bg-white/6 px-3 font-bold text-cream"
                  />
                  <Select
                    className="flex-1"
                    ariaLabel="Voting unit"
                    value={voteUnit}
                    onChange={(v) => setVoteUnit(v as Unit)}
                    options={UNIT_OPTIONS}
                  />
                </div>
              </div>
            </div>

            {schedule.error ? (
              <p role="alert" className="text-sm font-bold text-punch-soft">
                {schedule.error.message}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <ChunkyButton size="md" onClick={submit} disabled={schedule.isPending}>
                {schedule.isPending ? 'Saving…' : isScheduled ? 'Reschedule' : 'Schedule event'}
              </ChunkyButton>
              {isScheduled ? (
                <button
                  type="button"
                  onClick={() => unschedule.mutate()}
                  disabled={unschedule.isPending}
                  className="rounded-[14px] border-[3px] border-white/24 bg-white/8 px-5 py-3 font-display text-[15px] font-semibold text-cream hover:bg-white/16"
                >
                  Clear schedule
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {phase === 'open' ? (
          <p className="text-sm font-extrabold text-mint">
            Entries are open. The schedule locks once the first entry lands.
          </p>
        ) : null}

        {phase === 'voting' ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-extrabold text-bone-muted">
              Voting closes on its own at the time above. You can also end it now.
            </p>
            <ChunkyButton
              size="sm"
              tone="danger"
              onClick={() => close.mutate()}
              disabled={close.isPending}
            >
              {close.isPending ? 'Closing…' : 'Close voting now'}
            </ChunkyButton>
          </div>
        ) : null}

        {phase === 'finished' ? (
          <p className="text-sm font-extrabold text-bone-faint">
            This event has finished and the winner is frozen.
          </p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

/**
 * One scheduled date, as a tile.
 *
 * Split out rather than repeated four times inline: the value is a formatted
 * date that can be long, so it wraps under its label instead of fighting it for
 * one row, which is what the old two-column rows did on a phone.
 */
function ScheduleFact({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <PanelTile>
      <div className="text-[11px] font-black uppercase tracking-[1.2px] text-haze-5">{label}</div>
      <div
        className={`mt-1 font-display text-[15px] font-bold ${
          accent ? 'uppercase text-aqua' : 'text-cream'
        }`}
      >
        {value}
      </div>
    </PanelTile>
  );
}
