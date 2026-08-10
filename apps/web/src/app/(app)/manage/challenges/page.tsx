'use client';

import { ChallengeStatus, Role } from '@bb/shared';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { DifficultyBadge, StatusBadge } from '@/components/challenges/challenge-card';
import { StatTile } from '@/components/profile/stat-tile';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel, PanelHeader, PanelTitle, Skeleton } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { useManagerMetrics } from '@/features/analytics/use-analytics';
import { useSession } from '@/features/auth/use-session';
import { useChallengeLifecycle, useChallenges } from '@/features/challenges/use-challenges';
import { formatDate } from '@/lib/utils';

export default function ManageChallengesPage() {
  const { user } = useSession();
  const [status, setStatus] = useState<ChallengeStatus | ''>('');
  const query = useChallenges({ mine: true, status: status || undefined });
  const { data: metrics } = useManagerMetrics();
  const { publish, archive } = useChallengeLifecycle();

  const challenges = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (user && user.role === Role.PLAYER) {
    return (
      <Panel>
        <EmptyState
          title="Managers only"
          description="Writing challenges is a manager permission. Ask an admin if you should have it."
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Authoring"
        title="Your challenges"
        /*
          Full width on a phone, where a fixed 192px filter beside the button
          left the button too narrow for "New challenge" and it broke onto two
          lines. The filter now takes whatever is left and the button keeps its
          natural width.
        */
        action={
          <div className="flex w-full gap-3 sm:w-auto">
          <Select
            className="min-w-0 flex-1 sm:w-48 sm:flex-none"
            ariaLabel="Filter by status"
            value={status}
            onChange={(value) => setStatus(value as ChallengeStatus | '')}
            placeholder="All statuses"
            options={[
              { value: '', label: 'All statuses' },
              ...Object.values(ChallengeStatus).map((value) => ({
                value,
                label: value.charAt(0).toUpperCase() + value.slice(1),
              })),
            ]}
          />

          <Button asChild className="shrink-0 whitespace-nowrap">
            <Link href="/manage/challenges/new">New challenge</Link>
          </Button>
        </div>
        }
      />

      {/*
        The manager's own authoring stats.

        `/manager/metrics` has existed and been served the whole time with no
        consumer — the hook that called it was written and never rendered, so
        every manager saw nothing about how their work was actually used. Plays
        are now counted for real (a room drawing a brief increments them), which
        is what makes this worth showing rather than a row of zeros.
      */}
      {metrics ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Published" value={metrics.challenges.published} color="text-aqua" />
          <StatTile label="Drafts" value={metrics.challenges.draft} color="text-flame-lift" />
          <StatTile label="Archived" value={metrics.challenges.archived} />
          <StatTile label="Times played" value={metrics.totalPlays} color="text-select" />
        </section>
      ) : null}

      <Panel>
        <PanelHeader>
          <PanelTitle>Briefs</PanelTitle>
          <span className="font-mono text-xs text-bone-faint">{challenges.length} loaded</span>
        </PanelHeader>

        {query.isLoading ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : challenges.length === 0 ? (
          <EmptyState
            title="No briefs yet"
            description="Write one and publish it when the objectives are clear."
            action={
              <Button asChild size="sm" className="mt-2">
                <Link href="/manage/challenges/new">New challenge</Link>
              </Button>
            }
          />
        ) : (
          <>
            {/*
              Cards below md, the table from md up. The table is 44rem at its
              narrowest, so on a phone it sat in a sideways scroller with the
              status and actions columns off the edge — the two things this
              screen exists to show. The same rows are simply laid out
              vertically instead.
            */}
            <ul className="flex flex-col gap-3 p-4 md:hidden">
              {challenges.map((challenge) => (
                <li
                  key={challenge.id}
                  className="rounded-2xl border-[3px] border-edge bg-white/[0.04] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/manage/challenges/${challenge.slug}`}
                        className="font-display font-bold text-bone hover:text-select"
                      >
                        {challenge.title}
                      </Link>
                      <p className="mt-0.5 text-xs font-extrabold text-bone-faint">
                        {challenge.category.name}
                      </p>
                    </div>
                    <StatusBadge status={challenge.status} className="shrink-0" />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <DifficultyBadge difficulty={challenge.difficulty} />
                    <span className="font-mono text-xs text-bone-faint">
                      {formatDate(challenge.createdAt)}
                    </span>
                  </div>

                  <div className="mt-3">
                    <LifecycleButton
                      challenge={challenge}
                      onPublish={() => publish.mutate(challenge.id)}
                      onArchive={() => archive.mutate(challenge.id)}
                      busy={publish.isPending || archive.isPending}
                      full
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="border-b border-edge">
                  <th scope="col" className="eyebrow px-5 py-3">Title</th>
                  <th scope="col" className="eyebrow px-5 py-3">Difficulty</th>
                  <th scope="col" className="eyebrow px-5 py-3">Status</th>
                  <th scope="col" className="eyebrow px-5 py-3">Created</th>
                  <th scope="col" className="eyebrow px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {challenges.map((challenge) => (
                  <tr key={challenge.id} className="border-b border-edge/60 last:border-0">
                    <td className="px-5 py-3">
                      <Link
                        href={`/manage/challenges/${challenge.slug}`}
                        className="text-bone hover:text-select"
                      >
                        {challenge.title}
                      </Link>
                      <p className="font-mono text-xs text-bone-faint">
                        {challenge.category.name}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <DifficultyBadge difficulty={challenge.difficulty} />
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={challenge.status} />
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-bone-faint">
                      {formatDate(challenge.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <LifecycleButton
                        challenge={challenge}
                        onPublish={() => publish.mutate(challenge.id)}
                        onArchive={() => archive.mutate(challenge.id)}
                        busy={publish.isPending || archive.isPending}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </Panel>

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}


/**
 * Publish or archive, depending where the brief already is.
 *
 * Shared by the card list and the table so the two cannot drift into offering
 * different actions for the same row.
 */
function LifecycleButton({
  challenge,
  onPublish,
  onArchive,
  busy,
  full,
}: {
  challenge: { status: ChallengeStatus };
  onPublish: () => void;
  onArchive: () => void;
  busy: boolean;
  full?: boolean;
}) {
  const published = challenge.status === ChallengeStatus.PUBLISHED;

  return (
    <Button
      variant={published ? 'ghost' : 'outline'}
      size="sm"
      onClick={published ? onArchive : onPublish}
      disabled={busy}
      className={full ? 'w-full' : undefined}
    >
      {published ? 'Archive' : 'Publish'}
    </Button>
  );
}
