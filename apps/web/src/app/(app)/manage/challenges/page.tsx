'use client';

import { ChallengeStatus, Role } from '@bb/shared';
import Link from 'next/link';
import { useState } from 'react';

import { DifficultyBadge } from '@/components/challenges/challenge-card';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel, PanelHeader, PanelTitle, Skeleton } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { useSession } from '@/features/auth/use-session';
import { useChallengeLifecycle, useChallenges } from '@/features/challenges/use-challenges';
import { formatDate } from '@/lib/utils';

const STATUS_COLOR: Record<ChallengeStatus, string> = {
  [ChallengeStatus.PUBLISHED]: 'text-axis-y',
  [ChallengeStatus.DRAFT]: 'text-select',
  [ChallengeStatus.ARCHIVED]: 'text-bone-faint',
};

export default function ManageChallengesPage() {
  const { user } = useSession();
  const [status, setStatus] = useState<ChallengeStatus | ''>('');
  const query = useChallenges({ mine: true, status: status || undefined });
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Authoring</p>
          <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
            Your challenges
          </h1>
        </div>

        <div className="flex gap-3">
          <Select
            className="w-48"
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

          <Button asChild>
            <Link href="/manage/challenges/new">New challenge</Link>
          </Button>
        </div>
      </header>

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
          <div className="overflow-x-auto">
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
                    <td className={`px-5 py-3 font-mono text-xs ${STATUS_COLOR[challenge.status]}`}>
                      {challenge.status}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-bone-faint">
                      {formatDate(challenge.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {challenge.status === ChallengeStatus.PUBLISHED ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => archive.mutate(challenge.id)}
                          disabled={archive.isPending}
                        >
                          Archive
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => publish.mutate(challenge.id)}
                          disabled={publish.isPending}
                        >
                          Publish
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
