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
import { PageHeader } from '@/components/layout/page-header';
import { StatTile } from '@/components/profile/stat-tile';
import { Button } from '@/components/ui/button';
import {
  EmptyState,
  PANEL_ICON,
  Panel,
  PanelBody,
  PanelHeader,
  PanelTitle,
  Skeleton,
} from '@/components/ui/panel';
import { useSession } from '@/features/auth/use-session';
import { useActivityLog, useAdminMetrics } from '@/features/analytics/use-analytics';
import { UI_LOCALE, formatNumber } from '@/lib/utils';

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      <PageHeader
        eyebrow="Administration"
        title="Overview"
        // The numbers come from a snapshot refreshed every five minutes. Saying
        // so is more honest than implying they are live.
        action={
          <p className="shrink-0 font-mono text-xs text-bone-faint">
            Snapshot taken {new Date(metrics.generatedAt).toLocaleTimeString(UI_LOCALE)}
          </p>
        }
      />

      {/*
        Whether mail actually leaves the building.

        Verification and reset failures are silent by design — the send is
        swallowed so `forgot password` answers identically for a registered and
        an unknown address — so a deployment with no driver configured is
        indistinguishable from a working one on every other screen. This is the
        one place that says which it is.
      */}
      {!metrics.mail.canSend ? (
        <Panel className="border-punch">
          <PanelHeader tone="punch" icon={PANEL_ICON.clock}>
            <PanelTitle>Email is not being delivered</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col gap-2">
            <p className="text-sm font-extrabold text-haze">
              The mail driver is{' '}
              <span className="text-punch-soft">{metrics.mail.driver}</span>
              {metrics.mail.driver === 'log'
                ? ' — messages are written to the server log and never sent.'
                : ' — its credentials are missing, so every send is refused.'}{' '}
              Verification links and password resets are silently failing.
            </p>
            <p className="text-xs font-extrabold text-haze-5">
              Set MAIL_DRIVER and its credentials in the API environment, then redeploy.
            </p>
          </PanelBody>
        </Panel>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Players" value={metrics.users.total} />
        <StatTile label="Online now" value={metrics.users.online} color="text-mint" />
        <StatTile label="Contests completed" value={metrics.contests.completed} color="text-flame" />
        <StatTile label="Live contests" value={metrics.contests.live} />
        <StatTile label="Published challenges" value={metrics.challenges.published} color="text-aqua" />
        <StatTile label="Drafts" value={metrics.challenges.draft} color="text-flame-lift" />
        <StatTile label="Votes cast" value={metrics.engagement.totalVotes} color="text-punch" />
        <StatTile label="Entries" value={metrics.engagement.totalEntries} color="text-sun" />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
            <PanelTitle>Contests completed per day</PanelTitle>
            <span className="font-mono text-xs text-bone-faint">last 14 days</span>
          </PanelHeader>
          <PanelBody>
            <TimeSeriesChart
              data={metrics.contestsPerDay}
              dataKey="contests"
              unit="contests"
              gradientId="bb-bar-contests"
            />
          </PanelBody>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader>
            <PanelTitle>Signups per day</PanelTitle>
            <span className="font-mono text-xs text-bone-faint">last 14 days</span>
          </PanelHeader>
          <PanelBody>
            {/* A separate chart from contests, not a second line on the same plot:
                the two measures have different scales, and forcing them onto one
                axis would flatten whichever is smaller. */}
            <TimeSeriesChart
              data={metrics.signupsPerDay}
              dataKey="signups"
              unit="signups"
              gradientId="bb-bar-signups"
            />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Trending categories</PanelTitle>
            <span className="font-mono text-xs text-bone-faint">contests, last 7 days</span>
          </PanelHeader>
          <PanelBody>
            {metrics.trendingCategories.length === 0 ? (
              <p className="py-8 text-center text-sm text-bone-muted">
                No contests run this week.
              </p>
            ) : (
              <CategoryBarChart
                data={metrics.trendingCategories}
                dataKey="contests"
                labelKey="name"
                unit="contests"
              />
            )}
          </PanelBody>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader>
            <PanelTitle>Top players</PanelTitle>
          </PanelHeader>
          {metrics.topPlayers.length === 0 ? (
            <EmptyState
              title="No ranked players"
              description="Ranks appear once a room with enough entries finishes."
            />
          ) : (
            <ul>
              {metrics.topPlayers.map((player, index) => {
                const rank = index + 1;
                // The top three get a colour each, same triad as everywhere else
                // rank shows up in this app; the rest share one neutral badge.
                const badgeColor =
                  rank === 1 ? 'bg-sun' : rank === 2 ? 'bg-aqua' : rank === 3 ? 'bg-punch' : 'bg-bone-faint';
                return (
                  <li
                    key={player.userId}
                    className={`flex items-center gap-3.5 px-5 py-3.5 ${index > 0 ? 'border-t-2 border-white/[0.06]' : ''}`}
                  >
                    <span
                      className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] border-[2.5px] border-edge font-display text-sm font-bold text-edge ${badgeColor}`}
                      style={{ boxShadow: '0 3px 0 var(--color-edge)' }}
                    >
                      {rank}
                    </span>
                    <Link
                      href={`/u/${player.username}`}
                      className="min-w-0 flex-1 truncate font-display text-base font-bold text-bone hover:text-select"
                    >
                      {player.username}
                    </Link>
                    <span
                      className={`shrink-0 font-bold text-xs ${rank === 1 ? 'text-sun' : 'text-bone-faint'}`}
                    >
                      {formatNumber(player.score)} pts · {player.wins}W
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Roles &amp; moderation</PanelTitle>
          </PanelHeader>
          <PanelBody className="grid grid-cols-2 gap-3">
            <StatTile label="Players" value={metrics.users.byRole.player} />
            <StatTile label="Managers" value={metrics.users.byRole.manager} color="text-aqua" />
            <StatTile label="Admins" value={metrics.users.byRole.admin} color="text-sun" />
            <StatTile label="Banned" value={metrics.users.banned} color="text-punch" />
            <StatTile label="Suspended" value={metrics.users.suspended} />
            <StatTile
              label="Most played"
              value={metrics.mostPlayedChallenge?.title ?? '—'}
              color="text-flame"
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
          <ul>
            {logs.slice(0, 15).map((log, index) => (
              <li
                key={log.id}
                className={`flex flex-wrap items-center justify-between gap-4 px-5 py-3 ${index > 0 ? 'border-t-2 border-white/[0.05]' : ''}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-[3px] border-2 border-edge ${eventDotColor(log.action)}`}
                  />
                  <span
                    // Security events are the ones an admin is scanning for;
                    // everything else is routine and stays quiet.
                    className={`shrink-0 font-bold text-[13px] tabular-nums ${
                      log.action.startsWith('security.') ? 'text-axis-x' : 'text-bone'
                    }`}
                  >
                    {log.action}
                  </span>
                  {log.actor ? (
                    <Link
                      href={`/u/${log.actor.username}`}
                      className="truncate text-[12.5px] font-bold text-bone-muted hover:text-select"
                    >
                      {log.actor.username}
                    </Link>
                  ) : (
                    <span className="truncate text-[12.5px] font-bold italic text-bone-faint">system</span>
                  )}
                </div>
                <span className="shrink-0 font-bold text-xs text-bone-faint">
                  {new Date(log.createdAt).toLocaleString(UI_LOCALE)}
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

/** One colour per event family, so the eye can scan the feed before reading. */
function eventDotColor(action: string): string {
  if (action.startsWith('user.registered')) return 'bg-mint';
  if (action.startsWith('challenge.')) return 'bg-sun';
  if (action.startsWith('user.profile')) return 'bg-punch';
  return 'bg-aqua';
}
