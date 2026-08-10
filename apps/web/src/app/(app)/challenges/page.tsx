'use client';

import { Difficulty, Role } from '@bb/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { ChallengeCard } from '@/components/challenges/challenge-card';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel, Skeleton } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { useSession } from '@/features/auth/use-session';
import { useCategories, useChallenges } from '@/features/challenges/use-challenges';

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'Beginner',
  [Difficulty.MEDIUM]: 'Intermediate',
  [Difficulty.HARD]: 'Advanced',
};

/**
   * Suspense boundary for `useSearchParams`.
   *
   * Next requires one around any component reading search params, or the whole
   * route opts out of static rendering at build time.
   */
export default function ChallengesPage() {
  return (
    <Suspense fallback={null}>
      <ChallengeCatalogue />
    </Suspense>
  );
}

function ChallengeCatalogue() {
  const { user } = useSession();
  /*
    Tag links on a brief point here as `/challenges?tag=<slug>`. Until this
    read them the parameter was ignored entirely: the link navigated, the URL
    changed, and the unfiltered catalogue rendered — which looks exactly like a
    filter that matched everything.
  */
  const tag = useSearchParams().get('tag') ?? undefined;
  const { data: categories } = useCategories();
  const [categoryId, setCategoryId] = useState<string>('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [search, setSearch] = useState('');

  const query = useChallenges({
    categoryId: categoryId || undefined,
    difficulty: difficulty || undefined,
    search: search || undefined,
    tag,
  });

  const challenges = query.data?.pages.flatMap((page) => page.items) ?? [];
  const canAuthor = user?.role === Role.MANAGER || user?.role === Role.ADMIN;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Catalogue"
        title="Challenges"
        action={

        <div className="flex gap-3">
          <Button asChild variant="outline">
            <Link href="/rooms">Start a room</Link>
          </Button>
          {canAuthor ? (
            <Button asChild>
              <Link href="/manage/challenges/new">New challenge</Link>
            </Button>
          ) : null}
        </div>
        }
      />

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search titles"
          aria-label="Search challenges"
          className="arcade-focus h-11 w-56 rounded-2xl border-[3px] border-edge bg-panel px-4 font-bold text-bone placeholder:text-bone-faint"
        />

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
            ariaLabel="Filter by category"
            value={categoryId}
            onChange={setCategoryId}
            placeholder="All categories"
            options={[
              { value: '', label: 'All categories' },
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

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square w-full" />
          ))}
        </div>
      ) : challenges.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nothing here yet"
            description={
              search || categoryId || difficulty
                ? 'No challenge matches those filters. Clear one and look again.'
                : 'The catalogue is empty. Managers publish the first briefs.'
            }
            action={
              canAuthor ? (
                <Button asChild size="sm" className="mt-2">
                  <Link href="/manage/challenges/new">Write the first one</Link>
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {challenges.map((challenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} />
          ))}
        </div>
      )}

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
