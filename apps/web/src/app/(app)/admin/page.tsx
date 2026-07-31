'use client';

import { Role } from '@bb/shared';
import dynamic from 'next/dynamic';
import Link from 'next/link';

/**
 * Recharts is the single heaviest dependency in the app and it is used on this
 * page alone, so it is split out of the shared bundle rather than shipped to
 * everyone who never opens the admin dashboard. `ssr: false` because the charts
 * measure their container before drawing and have no meaningful server render.
 */
const TimeSeriesChart = dynamic(
  () => import('@/components/analytics/charts').then((m) => m.TimeSeriesChart),
  { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> },
);
const CategoryBarChart = dynamic(
  () => import('@/components/analytics/charts').then((m) => m.CategoryBarChart),
  { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> },
);
import { StatTile } from '@/components/profile/record-bar';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel, PanelBody, PanelHeader, PanelTitle, Skeleton } from '@/components/ui/panel';
import { useSession } from '@/features/auth/use-session';
import { useActivityLog, useAdminMetrics } from '@/features/analytics/use-analytics';
import { formatNumber } from '@/lib/utils';

export default function AdminDashboardPage() {

  const { user } = useSession();
  const { data: metrics, isLoading } = useAdminMetrics();
  const activity = useActivityLog();

  if (user && user.role !== Role.ADMIN) {
    return (
      <Panel>
        <EmptyState
          title="Admins only"
          description="This overview is restricted to administrators."
        />
      </Panel>
    );
  }

  if (isLoading || !metrics) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const logs = activity.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
            Overview
          </h1>
        </div>

        {/* The numbers come from a snapshot refreshed every five minutes. Saying
            so is more honest than implying they are live. */}
        <p className="font-mono text-xs text-bone-faint">
          Snapshot taken {new Date(metrics.generatedAt).toLocaleTimeString()}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Players" value={metrics.users.total} />
        <StatTile label="Online now" value={metrics.users.online} />
        <StatTile label="Battles completed" value={metrics.battles.completed} />
        <StatTile label="Live battles" value={metrics.battles.live} />
        <StatTile label="Published challenges" value={metrics.challenges.published} />
        <StatTile label="Drafts" value={metrics.challenges.draft} />
        <StatTile label="Votes cast" value={metrics.engagement.totalVotes} />
        <StatTile label="Reactions" value={metrics.engagement.totalReactions} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-1">
          <PanelHeader>
            <PanelTitle>Active players</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col gap-3">
            {/* DAU/WAU/MAU as tiles rather than three bars: they are nested
                populations, and a bar chart of nested sets invites the reader to
                compare them as if they were independent. */}
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">Daily</span>
              <span className="font-mono text-lg text-bone">{metrics.engagement.dau}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">Weekly</span>
              <span className="font-mono text-lg text-bone">{metrics.engagement.wau}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">Monthly</span>
              <span className="font-mono text-lg text-bone">{metrics.engagement.mau}</span>
            </div>
            <div className="mt-2 border-t border-edge pt-3">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow">New this week</span>
                <span className="font-mono text-lg text-select">
                  {metrics.users.newLast7Days}
                </span>
              </div>
            </div>
          </PanelBody>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader>
            <PanelTitle>Battles completed per day</PanelTitle>
            <span className="font-mono text-xs text-bone-faint">last 14 days</span>
          </PanelHeader>
          <PanelBody>
            <TimeSeriesChart data={metrics.battlesPerDay} dataKey="battles" unit="battles" />
          </PanelBody>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader>
            <PanelTitle>Signups per day</PanelTitle>
            <span className="font-mono text-xs text-bone-faint">last 14 days</span>
          </PanelHeader>
          <PanelBody>
            {/* A separate chart from battles, not a second line on the same plot:
                the two measures have different scales, and forcing them onto one
                axis would flatten whichever is smaller. */}
            <TimeSeriesChart data={metrics.signupsPerDay} dataKey="signups" unit="signups" />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Trending categories</PanelTitle>
            <span className="font-mono text-xs text-bone-faint">battles, last 7 days</span>
          </PanelHeader>
          <PanelBody>
            {metrics.trendingCategories.length === 0 ? (
              <p className="py-8 text-center text-sm text-bone-muted">
                No battles fought this week.
              </p>
            ) : (
              <CategoryBarChart
                data={metrics.trendingCategories}
                dataKey="battles"
                labelKey="name"
                unit="battles"
              />
            )}
          </PanelBody>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader>
            <PanelTitle>Top players</PanelTitle>
          </PanelHeader>
          {metrics.topPlayers.length === 0 ? (
            <EmptyState title="No ranked players" description="Ranks appear once battles finish." />
          ) : (
            <ul className="divide-y divide-edge/60">
              {metrics.topPlayers.map((player, index) => (
                <li
                  key={player.userId}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-bone-faint">{index + 1}</span>
                    <Link href={`/u/${player.username}`} className="text-sm text-bone hover:text-select">
                      {player.username}
                    </Link>
                  </div>
                  <span className="font-mono text-xs text-bone-muted">
                    {formatNumber(player.score)} pts · {player.wins}W
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Roles &amp; moderation</PanelTitle>
          </PanelHeader>
          <PanelBody className="grid grid-cols-2 gap-3">
            <StatTile label="Players" value={metrics.users.byRole.player} />
            <StatTile label="Managers" value={metrics.users.byRole.manager} />
            <StatTile label="Admins" value={metrics.users.byRole.admin} />
            <StatTile label="Banned" value={metrics.users.banned} />
            <StatTile label="Suspended" value={metrics.users.suspended} />
            <StatTile
              label="Most played"
              value={metrics.mostPlayedChallenge?.timesPlayed ?? 0}
            />
          </PanelBody>
        </Panel>
      </section>

      <Panel>
        <PanelHeader>
          <PanelTitle>Recent activity</PanelTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/users">Manage users</Link>
          </Button>
        </PanelHeader>

        {activity.isLoading ? (
          <PanelBody className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </PanelBody>
        ) : logs.length === 0 ? (
          <EmptyState title="Nothing logged yet" description="Audit events appear here as they happen." />
        ) : (
          <ul className="divide-y divide-edge/60">
            {logs.slice(0, 15).map((log) => (
              <li key={log.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
                <div className="flex items-center gap-3">
                  <span
                    // Security events are the ones an admin is scanning for;
                    // everything else is routine and stays quiet.
                    className={`font-mono text-xs ${
                      log.action.startsWith('security.') ? 'text-axis-x' : 'text-bone-muted'
                    }`}
                  >
                    {log.action}
                  </span>
                  {log.actor ? (
                    <Link href={`/u/${log.actor.username}`} className="text-xs text-bone hover:text-select">
                      {log.actor.username}
                    </Link>
                  ) : (
                    <span className="text-xs text-bone-faint">system</span>
                  )}
                </div>
                <span className="font-mono text-xs text-bone-faint">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}

        {activity.hasNextPage ? (
          <div className="flex justify-center border-t border-edge px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => activity.fetchNextPage()}
              disabled={activity.isFetchingNextPage}
            >
              {activity.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
