'use client';

import type { PortfolioItem } from '@bb/shared';
import Link from 'next/link';
import { use, useMemo, useState } from 'react';

import { ChevronIcon, FireIcon } from '@/components/ui/icons';
import { EmptyState, Panel, Skeleton } from '@/components/ui/panel';
import { useSession } from '@/features/auth/use-session';
import { usePortfolio, usePublicProfile, useShowcase } from '@/features/users/use-users';
import { formatDate } from '@/lib/utils';

export default function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const { user } = useSession();
  const { data: profile, isLoading, isError } = usePublicProfile(username);
  // Both fire alongside the profile so the models start downloading without
  // waiting on a request that has nothing to do with them.
  const { data: showcase } = useShowcase(username);
  const { data: portfolio } = usePortfolio(username);

  const work = useMemo(() => showcase ?? [], [showcase]);
  // The archive is every finished work that is not already in the showcase.
  const archive = useMemo(() => {
    const shown = new Set(work.map((item) => item.id));
    return (portfolio ?? []).filter((item) => !shown.has(item.id));
  }, [portfolio, work]);

  if (isLoading) return <ProfileSkeleton />;

  if (isError || !profile) {
    return (
      <Panel>
        <EmptyState
          title="No such artist"
          description={`Nobody is using the handle "${username}". Check the spelling, or the account may have been removed.`}
        />
      </Panel>
    );
  }

  const isOwn = user?.username === profile.username;

  return (
    <div className="flex flex-col gap-12">
      {/* ---- Hero -------------------------------------------------------- */}
      <section
        className="relative overflow-hidden rounded-[28px] border-4 border-edge"
        style={{
          background: 'radial-gradient(1000px 560px at 50% -12%, #322A85 0%, #1B1550 46%, #14103A 100%)',
          boxShadow: '0 12px 0 var(--color-edge)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1.5px, transparent 1.6px)',
            backgroundSize: '34px 34px',
          }}
        />

        <div className="relative flex flex-col items-center gap-5 px-6 py-12 text-center sm:px-10 sm:py-16">
          {/* Avatar with glow + bob */}
          <div className="relative" style={{ animation: 'bbPop .7s ease both' }}>
            <div
              className="pointer-events-none absolute -inset-6 rounded-full"
              style={{ background: 'radial-gradient(closest-side, rgba(255,122,24,.35), transparent 72%)' }}
            />
            <div
              className="relative h-40 w-40 overflow-hidden rounded-full border-[5px] border-edge bg-cream sm:h-52 sm:w-52"
              style={{ boxShadow: '0 14px 0 var(--color-edge)', animation: 'bbBob 5.4s ease-in-out infinite' }}
            >
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a sized asset
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-5xl font-bold text-bone-faint">
                  {profile.username.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            {profile.rank ? (
              <div
                className="absolute -right-3 bottom-1 rounded-2xl border-4 border-edge bg-aqua px-3 py-1.5 font-display text-sm font-bold text-edge"
                style={{ boxShadow: '0 6px 0 var(--color-edge)', transform: 'rotate(-6deg)' }}
              >
                #{profile.rank}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col items-center gap-3">
            <h1 className="font-display text-4xl font-bold uppercase leading-[0.98] tracking-tight text-cream sm:text-6xl">
              {profile.username}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span
                className="rounded-full border-[3px] border-edge bg-sun px-4 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-edge"
                style={{ boxShadow: '0 4px 0 var(--color-edge)' }}
              >
                {profile.experienceLevel}
              </span>
              {profile.rank ? (
                <span
                  className="rounded-full border-[3px] border-edge bg-mint px-4 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-edge"
                  style={{ boxShadow: '0 4px 0 var(--color-edge)' }}
                >
                  Rank #{profile.rank}
                </span>
              ) : null}
              {profile.country ? (
                <span className="rounded-full border-2 border-white/16 bg-white/[0.07] px-4 py-1.5 font-display text-xs font-bold text-bone-muted">
                  {profile.country}
                </span>
              ) : null}
            </div>
          </div>

          {profile.bio ? (
            <p className="max-w-2xl text-sm font-bold leading-relaxed text-bone-muted sm:text-base">
              {profile.bio}
            </p>
          ) : null}

          {/* Stat tiles — only stats the system actually tracks */}
          {/*
            A grid, not wrapped flex. Flex sized each tile to its own label, so
            "VOTES EARNED" came out wider than "WINS" and the four sat in a
            ragged block. Equal columns make them uniform at any width, and two
            per row is what fits a phone.
          */}
          <div className="mt-2 grid w-full max-w-md grid-cols-2 gap-3 sm:max-w-2xl sm:grid-cols-4">
            <StatTile value={String(profile.totalBattles)} label="BATTLES" color="text-sun" />
            <StatTile value={String(profile.wins)} label="WINS" color="text-aqua" />
            <StatTile
              value={compact(profile.totalVotesReceived)}
              label="VOTES EARNED"
              color="text-punch-soft"
            />
            <StatTile value={`${profile.winRate}%`} label="WIN RATE" color="text-mint" />
          </div>

          <div className="mt-2 flex flex-wrap justify-center gap-3">
            {isOwn ? (
              <HeroButton href="/settings/profile" label="Edit profile" primary />
            ) : (
              <HeroButton href="/rooms" label="Start a room" primary />
            )}
            <HeroButton href="/events" label="Public challenges" />
          </div>
        </div>
      </section>

      {/* ---- The Work: card gallery ------------------------------------- */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2.5">
            <Diamond />
            <span className="font-display text-xs font-bold uppercase tracking-[2px] text-sun">
              The Work
            </span>
            <Diamond />
          </div>
          <h2 className="font-display text-3xl font-bold uppercase tracking-tight text-bone sm:text-4xl">
            Battle gallery
          </h2>
          <p className="max-w-xl text-sm font-bold text-bone-faint">
            {work.length > 0
              ? 'The curated work — final renders and the workspace behind them. Use the thumbnails or arrows to move between pieces.'
              : isOwn
                ? 'Pin your finished works in settings to build a showcase.'
                : 'This artist has not pinned any work yet.'}
          </p>
        </div>

        {work.length === 0 ? (
          <Panel>
            <EmptyState
              title="Nothing pinned yet"
              description={
                isOwn
                  ? 'Head to Settings → Showcase to pin up to ten of your finished works.'
                  : 'Finished work appears here once this artist curates it.'
              }
              action={
                isOwn ? (
                  <Link
                    href="/settings/profile"
                    className="mt-2 font-display text-sm font-bold text-sun hover:text-mint"
                  >
                    Edit showcase →
                  </Link>
                ) : undefined
              }
            />
          </Panel>
        ) : (
          <WorkGallery work={work} />
        )}
      </section>

      {/* ---- Full archive ---------------------------------------------- */}
      {archive.length > 0 ? (
        <section className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <Diamond color="var(--color-aqua)" />
                <span className="font-display text-xs font-bold uppercase tracking-[2px] text-aqua">
                  Full archive
                </span>
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold uppercase tracking-tight text-bone sm:text-3xl">
                Every other run
              </h2>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {archive.map((item) => (
              <ArchiveCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- Marquee ---------------------------------------------------- */}
      <div
        className="relative overflow-hidden rounded-2xl border-4 border-edge bg-sun py-3"
        style={{ boxShadow: '0 6px 0 var(--color-edge)' }}
      >
        <div
          className="flex w-max whitespace-nowrap font-display text-base font-bold text-edge"
          style={{ animation: 'bbMarquee 26s linear infinite' }}
        >
          <MarqueeRun profile={profile} />
          <MarqueeRun profile={profile} />
        </div>
      </div>
    </div>
  );
}

/**
 * The inline work gallery — no card-then-click.
 *
 * A big featured image with the piece's details beside it, a render/workspace
 * toggle, and a thumbnail strip to move between works. Everything is on the page;
 * nothing opens a modal.
 */
function WorkGallery({ work }: { work: PortfolioItem[] }) {
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<'render' | 'workspace'>('render');
  const active = index < work.length ? index : 0;
  const item = work[active]!;
  const hasWorkspace = Boolean(item.workspacePhotoUrl);
  const shown = view === 'workspace' && hasWorkspace ? item.workspacePhotoUrl! : item.imageUrl;

  const go = (next: number) => {
    setIndex(((next % work.length) + work.length) % work.length);
    setView('render');
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid items-stretch gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Featured image */}
        <div
          className="relative overflow-hidden rounded-[20px] border-4 border-edge bg-void"
          style={{ boxShadow: '0 8px 0 var(--color-edge)' }}
        >
          <div className="aspect-square w-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
            <img
              key={shown}
              src={shown}
              alt={`${view === 'workspace' ? 'Workspace for' : 'Render of'} ${item.challengeTitle}`}
              className="h-full w-full object-cover"
              style={{ animation: 'bbPop .3s ease both' }}
            />
          </div>

          {item.isWinner ? (
            <span
              className="absolute left-3 top-3 rounded-full border-2 border-edge bg-sun px-3 py-1 font-display text-xs font-bold uppercase tracking-wider text-edge"
              style={{ boxShadow: '0 3px 0 var(--color-edge)' }}
            >
              🥇 Winner
            </span>
          ) : null}

          {/* Render / Workspace toggle */}
          {hasWorkspace ? (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border-2 border-edge bg-void/85 p-1 backdrop-blur-sm">
              <ToggleChip active={view === 'render'} onClick={() => setView('render')} label="Render" />
              <ToggleChip
                active={view === 'workspace'}
                onClick={() => setView('workspace')}
                label="Workspace"
              />
            </div>
          ) : null}
        </div>

        {/* Details panel */}
        <div
          className="flex flex-col justify-center gap-3 rounded-[20px] border-4 border-edge bg-panel-raised p-6"
          style={{ boxShadow: '0 8px 0 var(--color-edge)' }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border-2 border-edge bg-sun px-3 py-1 font-display text-[0.6875rem] font-bold uppercase tracking-wider text-edge">
              {item.category}
            </span>
            <span className="rounded-full border-2 border-white/16 bg-void/40 px-3 py-1 font-display text-[0.6875rem] font-bold uppercase tracking-wider text-bone-muted">
              {item.difficulty}
            </span>
            <span className="flex items-center gap-1.5 font-display text-xs font-bold text-sun">
              <FireIcon size={15} /> {item.voteCount}
            </span>
          </div>

          <h3 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-bone sm:text-3xl">
            {item.challengeTitle}
          </h3>
          <p className="text-sm leading-relaxed text-bone-muted">{item.challengeDescription}</p>
          <p className="font-mono text-xs text-bone-faint">Submitted {formatDate(item.submittedAt)}</p>

          <div className="mt-2 flex items-center gap-3">
            <GalleryArrow label="Previous work" onClick={() => go(active - 1)}>
              <ChevronIcon direction="left" />
            </GalleryArrow>
            <span className="font-display text-xs font-bold tabular-nums text-bone-faint">
              {active + 1} / {work.length}
            </span>
            <GalleryArrow label="Next work" onClick={() => go(active + 1)}>
              <ChevronIcon direction="right" />
            </GalleryArrow>
          </div>
        </div>
      </div>

      {/* Thumbnail strip */}
      {work.length > 1 ? (
        <div className="flex flex-wrap gap-2.5">
          {work.map((entry, i) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${entry.challengeTitle}`}
              aria-current={i === active}
              className={`h-16 w-16 overflow-hidden rounded-xl border-[3px] transition-colors ${
                i === active ? 'border-sun' : 'border-white/16 hover:border-white/40'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
              <img src={entry.imageUrl} alt={entry.challengeTitle} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 font-display text-[0.6875rem] font-bold uppercase tracking-wider transition-colors ${
        active ? 'bg-sun text-edge' : 'text-bone-muted hover:text-bone'
      }`}
    >
      {label}
    </button>
  );
}

function GalleryArrow({
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
      onClick={onClick}
      aria-label={label}
      className="arcade-focus flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-edge bg-void/40 font-display text-lg font-bold text-bone hover:text-sun"
      style={{ boxShadow: '0 3px 0 var(--color-edge)' }}
    >
      {children}
    </button>
  );
}

/** "2900" → "2.9K". Keeps the votes tile from wrapping on big numbers. */
function compact(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
}

function StatTile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div
      className="flex min-w-0 flex-col justify-center rounded-[18px] border-4 border-edge bg-cream px-4 py-3 text-center sm:px-5"
      style={{ boxShadow: '0 8px 0 var(--color-edge)' }}
    >
      <div className={`font-display text-3xl font-bold leading-none ${color}`}>{value}</div>
      <div className="mt-1.5 font-display text-[0.6875rem] font-bold uppercase tracking-wider text-edge/60">
        {label}
      </div>
    </div>
  );
}

function HeroButton({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={
        primary
          ? 'arcade-press rounded-2xl border-4 border-edge bg-linear-to-b from-flame-lift to-sun px-7 py-3.5 font-display text-lg font-bold text-edge [--press-depth:8px]'
          : 'rounded-2xl border-4 border-white/20 bg-white/[0.07] px-7 py-3.5 font-display text-lg font-bold text-bone hover:bg-white/[0.13]'
      }
      style={primary ? { boxShadow: '0 8px 0 var(--color-edge)' } : undefined}
    >
      {label}
    </Link>
  );
}

function Diamond({ color = 'var(--color-sun)' }: { color?: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 rotate-45 border-[3px] border-edge"
      style={{ borderRadius: 4, background: color }}
    />
  );
}

function ArchiveCard({ item }: { item: PortfolioItem }) {
  return (
    <Link
      href={`/challenges/${item.challengeSlug}`}
      className="arcade-press flex flex-col gap-2 rounded-[18px] border-4 border-edge bg-cream p-4 [--press-depth:4px]"
      style={{ boxShadow: '0 8px 0 var(--color-edge)' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="h-8 w-8 rotate-45 rounded-[10px] border-[3px] border-edge bg-sun"
          aria-hidden="true"
        />
        {item.isWinner ? <span className="text-lg leading-none">🥇</span> : null}
      </div>
      <div className="mt-2 font-display text-lg font-bold leading-tight text-edge">
        {item.challengeTitle}
      </div>
      <div className="text-xs font-bold text-edge/50">{item.category}</div>
      <div className="mt-1 flex items-center justify-between">
        <span className="rounded-full border-2 border-edge/20 bg-edge/[0.06] px-2.5 py-0.5 font-display text-[0.625rem] font-bold uppercase text-edge">
          {item.difficulty}
        </span>
        <span className="flex items-center gap-1 font-display text-xs font-bold text-flame">
          ▲ {item.voteCount}
        </span>
      </div>
    </Link>
  );
}

function MarqueeRun({
  profile,
}: {
  profile: { totalBattles: number; wins: number; totalVotesReceived: number; experienceLevel: string };
}) {
  const parts = [
    `${profile.totalBattles} BATTLES`,
    `${profile.wins} WINS`,
    `${compact(profile.totalVotesReceived)} VOTES`,
    profile.experienceLevel.toUpperCase(),
  ];
  return <span className="px-3">{parts.join(' ✦ ')} ✦ </span>;
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-12">
      <Skeleton className="h-96 w-full rounded-[28px]" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="aspect-square w-full rounded-[20px]" />
        ))}
      </div>
    </div>
  );
}
