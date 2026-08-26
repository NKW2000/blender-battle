'use client';

import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, Panel, Skeleton } from '@/components/ui/panel';
import { useSession } from '@/features/auth/use-session';
import { useLeaderboard } from '@/features/leaderboard/use-leaderboard';

/**
 * The standings.
 *
 * This page is the reason the rest of the contest machinery is worth having.
 * The server draws briefs the host cannot see, strips authors out of ballots,
 * refuses self-votes and freezes deadlines nobody can move — all of it protects
 * the integrity of a result, and until there was somewhere for a result to go,
 * none of it protected anything anyone wanted.
 */
export default function LeaderboardPage() {
  const { user } = useSession();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useLeaderboard();

  // Every page flattened into one continuous list: ranks run straight through,
  // so a page boundary is not a thing the reader should ever notice.
  const standings = data?.pages.flat() ?? [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Standings"
        title="Leaderboard"
        description="Score moves on ranked rooms only — a room needs four artists who actually submitted before it counts. Winning gains, losing costs, and entering a room nobody finished does neither."
      />

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-16 w-full" />
          ))}
        </div>
      ) : standings.length === 0 ? (
        <EmptyState
          title="Nobody is ranked yet"
          description="The first ranked room to finish puts someone here."
        />
      ) : (
        <Panel>
          {/*
            A list of rows rather than a table.

            Every row is a link to a profile, and a table cell containing a
            block-level link is a layout that fights itself at mobile widths —
            this is the same card-over-table choice the challenge list already
            makes for the same reason.
          */}
          <ul>
            {standings.map((entry) => {
              const isMe = entry.userId === user?.id;
              // The top three get the same colour triad rank uses everywhere
              // else in the app; the rest share one neutral badge.
              const badge =
                entry.rank === 1
                  ? 'bg-sun text-void'
                  : entry.rank === 2
                    ? 'bg-aqua text-void'
                    : entry.rank === 3
                      ? 'bg-punch text-bone'
                      : 'bg-panel-raised text-bone-muted';

              return (
                <li
                  key={entry.userId}
                  className={`flex items-center gap-4 border-b-2 border-edge px-4 py-3 last:border-b-0 ${
                    isMe ? 'bg-select/10' : ''
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl border-2 border-edge font-display text-sm font-bold ${badge}`}
                  >
                    {entry.rank}
                  </span>

                  <Link
                    href={`/u/${entry.username}`}
                    className="arcade-focus min-w-0 flex-1 rounded-lg"
                  >
                    <span className="block truncate font-display text-base font-bold text-bone">
                      {entry.username}
                      {isMe ? (
                        <span className="ml-2 text-xs font-extrabold text-select">you</span>
                      ) : null}
                    </span>
                    <span className="block text-xs font-extrabold text-bone-faint">
                      {entry.wins}W · {entry.losses}L · {entry.winRate}% win rate
                    </span>
                  </Link>

                  <span className="flex-none text-right">
                    <span className="block font-mono text-lg text-bone">{entry.score}</span>
                    <span className="block text-[11px] font-extrabold uppercase tracking-wider text-bone-faint">
                      score
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {hasNextPage ? (
            <div className="flex justify-center border-t-2 border-edge px-4 py-4">
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className="arcade-focus rounded-[14px] border-[3px] border-white/16 bg-white/6 px-5 py-2.5 font-display text-sm font-bold text-bone transition-colors hover:bg-white/12 disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading…' : 'Show more'}
              </button>
            </div>
          ) : null}
        </Panel>
      )}
    </div>
  );
}
