'use client';

import {
  SOCIAL_LINK_KEYS,
  SOCIAL_LINK_LABELS,
  type PortfolioItem,
  type SocialLinks,
} from '@bb/shared';
import Link from 'next/link';
import { use, useMemo, useState } from 'react';

import { ChevronIcon, FireIcon } from '@/components/ui/icons';
import { EmptyState, Panel, Skeleton } from '@/components/ui/panel';
import { SwipeRow } from '@/components/ui/swipe-row';
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
              style={{ background: 'radial-gradient(closest-side, rgba(255,210,63,.35), transparent 72%)' }}
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

          <SocialLinkRow links={profile.socialLinks} />

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

          {/*
            Swiped on a phone, a grid from `sm` up.

            One card per row put a single square on screen at a time, so an
            artist with twenty finished runs had twenty screens of scrolling
            below their showcase. `sm:contents` on the track takes the wrapper
            out of the layout entirely once there is width for a grid, which
            hands the cards straight to it — the same markup, laid out two ways,
            rather than two copies kept in step by hand.
          */}
          <SwipeRow
            ariaLabel={`${archive.length} archived works`}
            className="snap-x snap-mandatory pb-1 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-x-visible lg:grid-cols-4"
            trackClassName="gap-4 sm:contents"
            itemSelector=":scope > * > *"
          >
            {/*
              Each card is sized against the viewport, not the track.

              A percentage would resolve against the `w-fit` track, whose own
              width depends on its children — a circular question the browser
              answers with a number that means nothing. Measured at 375px it gave
              160px cards instead of the intended ~290. The cap keeps them sane
              on the widths between a phone and the `sm` grid.
            */}
            {archive.map((item) => (
              <div
                key={item.id}
                className="w-[78vw] max-w-[320px] shrink-0 snap-center sm:w-auto sm:max-w-none"
              >
                <ArchiveCard item={item} />
              </div>
            ))}
          </SwipeRow>
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
      {/*
        One block on a phone, two cards side by side from `lg`.

        Stacked, these were a bordered image card and a bordered details card
        with a gap between them — and because they carried different borders (4px
        `edge` against 3px `ink`) they read as two unrelated sections rather than
        one piece of work and its description. Side by side that separation is
        correct; stacked it is just a seam through the middle of one thing.

        So the wrapper owns the outline while stacked and the children own it once
        there is room to sit them apart. The shadow moves with it, or the seam
        would still be drawn by a shadow between two halves of the same card.
      */}
      <div className="grid grid-cols-1 items-stretch overflow-hidden rounded-[20px] border-4 border-edge bg-void shadow-[0_8px_0_var(--color-edge)] lg:grid-cols-[1.4fr_1fr] lg:gap-5 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none">
        {/* Featured image */}
        <div className="relative bg-void lg:overflow-hidden lg:rounded-[20px] lg:border-4 lg:border-edge lg:shadow-[0_8px_0_var(--color-edge)]">
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

        {/*
          Details panel.

          Stacked, its only edge is the rule separating it from the image above —
          same weight and colour as the wrapper's outline, so it reads as a fold
          in one card rather than the top of a second one.
        */}
        <div className="flex flex-col justify-center gap-3 border-t-4 border-edge bg-white/4 p-6 lg:rounded-[22px] lg:border-[3px] lg:border-ink lg:shadow-[0_8px_0_var(--color-edge)]">
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

      {/*
        Thumbnail strip.

        It used to wrap, which on a phone turned ten pinned works into three
        left-aligned rows sitting under a centred gallery — the strip read as
        spill rather than as a control. One line that scrolls keeps it a strip at
        any width, centred while it fits and swipeable once it does not.
      */}
      {work.length > 1 ? (
        <SwipeRow
          ariaLabel={`${work.length} pinned works`}
          className="snap-x snap-mandatory pb-1"
          trackClassName="gap-2.5"
        >
          {work.map((entry, i) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${entry.challengeTitle}`}
              aria-current={i === active}
              className={`h-16 w-16 shrink-0 snap-center overflow-hidden rounded-xl border-[3px] transition-colors ${
                i === active ? 'border-sun' : 'border-white/16 hover:border-white/40'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
              <img src={entry.imageUrl} alt={entry.challengeTitle} className="h-full w-full object-cover" />
            </button>
          ))}
        </SwipeRow>
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
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="aspect-square w-full rounded-[20px]" />
        ))}
      </div>
    </div>
  );
}


/**
 * Where else to find this artist.
 *
 * Named pills rather than brand logos. The icon set in this project already
 * makes the argument — the marks are drawn here so they carry this palette and
 * this weight, and dropping in ten other companies' logos would undo exactly
 * that. A label also survives a platform rebranding its glyph, and reads to a
 * screen reader without help.
 *
 * Renders nothing at all when there are no links, rather than an empty heading.
 */
function SocialLinkRow({ links }: { links: SocialLinks }) {
  const present = SOCIAL_LINK_KEYS.filter((key) => Boolean(links[key]?.trim()));
  if (present.length === 0) return null;

  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {present.map((key) => {
        const value = links[key]!.trim();
        const label = SOCIAL_LINK_LABELS[key];

        // Discord is a handle, not a URL — there is nowhere to link to, so it
        // is shown as text that can be copied rather than a dead anchor.
        if (key === 'discord') {
          return (
            <li key={key}>
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-white/16 bg-white/[0.07] px-3.5 py-1.5 font-display text-xs font-bold text-bone-muted">
                <span className="text-bone-faint">{label}</span>
                {value}
              </span>
            </li>
          );
        }

        return (
          <li key={key}>
            <a
              href={value}
              target="_blank"
              /*
                `noopener` is the one that matters: without it the opened page
                gets a handle on this window through `window.opener` and can
                navigate it somewhere else. `noreferrer` also covers older
                browsers that ignore `noopener`.
              */
              rel="me noopener noreferrer"
              className="arcade-focus inline-flex items-center gap-1.5 rounded-full border-2 border-white/16 bg-white/[0.07] px-3.5 py-1.5 font-display text-xs font-bold text-bone transition-colors hover:border-aqua/60 hover:text-aqua"
            >
              {label}
              <ExternalGlyph />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function ExternalGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
