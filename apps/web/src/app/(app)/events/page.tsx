'use client';

import { Difficulty } from '@bb/shared';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, Panel, Skeleton } from '@/components/ui/panel';
import { UI_LOCALE } from '@/lib/utils';
import { Select } from '@/components/ui/select';
import { useCategories } from '@/features/challenges/use-challenges';
import { useEvents, type EventPhase, type EventSummary } from '@/features/challenges/use-events';

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'Beginner',
  [Difficulty.MEDIUM]: 'Intermediate',
  [Difficulty.HARD]: 'Advanced',
};

const PHASE_META: Record<EventPhase, { label: string; tone: string }> = {
  upcoming: { label: 'Upcoming', tone: 'border-aqua text-aqua' },
  open: { label: 'Open now', tone: 'border-mint text-mint' },
  voting: { label: 'Voting', tone: 'border-sun text-sun' },
  finished: { label: 'Finished', tone: 'border-white/20 text-bone-faint' },
  'not-an-event': { label: '', tone: '' },
};

/**
 * Public challenges: everyone enters, a clock decides the phase.
 *
 * Distinct from the catalogue at /challenges — those are drawn into private
 * rooms and have no calendar. These are open competitions on dates.
 */
export default function EventsPage() {
  const { data: events, isLoading } = useEvents();
  const { data: categories } = useCategories();
  const [categoryId, setCategoryId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');

  const list = (events ?? []).filter((event) => {
    if (categoryId && event.category?.id !== categoryId) return false;
    if (difficulty && event.difficulty !== difficulty) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Live"
        title="Public challenges"
        description="Open to everyone. Enter before the deadline, then vote for the winner."
      />

      <div className="flex flex-wrap gap-3">
        {/*
          Hidden while there is only one discipline to choose between.

          A filter with a single option cannot change what is shown, so it is
          furniture that invites a pointless interaction. Conditional rather than
          deleted: the categories table and this picker both still work, so
          bringing a second discipline back is an INSERT, not a code change.
        */}
        {(categories?.length ?? 0) > 1 ? (
          <Select
            className="w-56"
            ariaLabel="Filter by challenge type"
            value={categoryId}
            onChange={setCategoryId}
            placeholder="All types"
            options={[
              { value: '', label: 'All types' },
              ...(categories ?? []).map((category) => ({
                value: category.id,
                label: category.name,
              })),
            ]}
          />
        ) : null}

        <Select
          className="w-56"
          ariaLabel="Filter by difficulty"
          value={difficulty}
          onChange={(value) => setDifficulty(value as Difficulty | '')}
          placeholder="Any difficulty"
          options={[
            { value: '', label: 'Any difficulty' },
            ...Object.values(Difficulty).map((value) => ({
              value,
              label: DIFFICULTY_LABEL[value],
            })),
          ]}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Panel>
          <EmptyState
            title="No public challenges"
            description={
              categoryId || difficulty
                ? 'No challenge matches those filters. Clear one and look again.'
                : 'There are no open competitions right now. Check back soon.'
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: EventSummary }) {
  const phase = PHASE_META[event.phase];
  const deadline = event.endDate ? new Date(event.endDate) : null;

  return (
    <Link
      href={`/events/${event.id}`}
      className="arcade-press group flex flex-col overflow-hidden rounded-[22px] border-[3px] border-ink bg-white/4 [--press-depth:5px]"
      style={{ boxShadow: '0 6px 0 var(--color-edge)' }}
    >
      <div className="relative aspect-square overflow-hidden border-b-[3px] border-ink bg-arcade-deep">
        {event.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a pre-sized asset
          <img
            src={event.coverImageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="viewport-grid h-full w-full" />
        )}

        <span
          className={`absolute right-3 top-3 rounded-full border-2 bg-void/85 px-2 py-0.5 text-[0.625rem] font-black uppercase tracking-wider ${phase.tone}`}
        >
          {phase.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="eyebrow text-aqua">{event.category?.name ?? 'Any discipline'}</span>

        <p className="font-display text-lg font-bold leading-tight text-bone">{event.title}</p>

        <p className="line-clamp-2 text-sm text-bone-muted">{event.shortDescription}</p>

        <div className="mt-auto flex items-center justify-between text-xs font-extrabold text-bone-faint">
          <span>{DIFFICULTY_LABEL[event.difficulty]}</span>
          {deadline ? (
            <span>
              {event.phase === 'open'
                ? `closes ${deadline.toLocaleDateString(UI_LOCALE)}`
                : event.phase === 'upcoming'
                  ? `opens ${event.startDate ? new Date(event.startDate).toLocaleDateString(UI_LOCALE) : ''}`
                  : ''}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
