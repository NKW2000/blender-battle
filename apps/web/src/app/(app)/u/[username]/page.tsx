'use client';

import type { PortfolioItem } from '@bb/shared';
import Link from 'next/link';
import { use } from 'react';

import { PortfolioScene } from '@/components/profile/portfolio-scene';
import { RecordBar, StatTile } from '@/components/profile/record-bar';
import { TiltCard } from '@/components/profile/tilt-card';
import { FireIcon } from '@/components/ui/icons';
import { EmptyState, Panel, PanelBody, Skeleton } from '@/components/ui/panel';
import { usePortfolio, usePublicProfile } from '@/features/users/use-users';
import { formatDate } from '@/lib/utils';

export default function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const { data: profile, isLoading, isError } = usePublicProfile(username);
  // Fired alongside the profile rather than after it: the models behind the
  // header are the slowest thing on the page and should start downloading
  // without waiting for a round trip that has nothing to do with them.
  const { data: portfolio } = usePortfolio(username);

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

  const socials = Object.entries(profile.socialLinks).filter(([, value]) => Boolean(value));
  const work = portfolio ?? [];
  const models = work
    .filter((item) => item.modelUrl)
    .map((item) => ({ url: item.modelUrl as string, filename: item.modelFilename }));
  const wins = work.filter((item) => item.isWinner).length;

  return (
    <div className="flex flex-col gap-10">
      {/*
        The stage. The canvas is absolutely positioned inside this panel and
        marked aria-hidden, so the models are decoration behind the identity
        block rather than something a screen reader has to narrate.
      */}
      <section
        className="relative overflow-hidden rounded-[28px] border-4 border-edge"
        style={{
          background: 'linear-gradient(160deg,#2A2170 0%,#1B1550 55%,#14103A 100%)',
          boxShadow: '0 12px 0 var(--color-edge)',
        }}
      >
        <PortfolioScene models={models} className="absolute inset-0" />

        {/*
          A vignette between the meshes and the text. Without it a pale model
          drifting behind the username drops the contrast below readable.
        */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 15% 30%, rgba(20,16,58,.92) 0%, rgba(20,16,58,.55) 45%, rgba(20,16,58,0) 75%)',
          }}
        />

        <div className="relative flex flex-col gap-8 px-6 py-10 sm:px-10 sm:py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-5">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already serves a sized, optimised asset
                <img
                  src={profile.avatarUrl}
                  alt=""
                  className="h-24 w-24 shrink-0 rounded-2xl border-[3px] border-edge object-cover sm:h-28 sm:w-28"
                  style={{ boxShadow: '0 5px 0 var(--color-edge)' }}
                />
              ) : (
                <div
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-[3px] border-edge bg-panel-raised font-display text-3xl text-bone-faint sm:h-28 sm:w-28"
                  style={{ boxShadow: '0 5px 0 var(--color-edge)' }}
                >
                  {profile.username.slice(0, 2).toUpperCase()}
                </div>
              )}

              <div>
                <p className="eyebrow text-aqua">{profile.experienceLevel}</p>
                <h1 className="font-display text-3xl font-bold uppercase leading-[1.05] tracking-tight text-cream sm:text-5xl">
                  {profile.username}
                </h1>
                <p className="mt-2 font-mono text-xs text-bone-faint">
                  Joined {formatDate(profile.joinedAt)}
                  {profile.country ? ` · ${profile.country}` : ''}
                  {profile.rank ? ` · Rank #${profile.rank}` : ''}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 gap-3">
              <HeroStat label="Score" value={profile.score} tone="text-sun" />
              <HeroStat label="Wins" value={wins} tone="text-mint" />
              <HeroStat label="Pieces" value={work.length} tone="text-aqua" />
            </div>
          </div>

          {profile.bio ? (
            <p className="max-w-2xl text-sm font-bold leading-relaxed text-bone-muted">
              {profile.bio}
            </p>
          ) : null}

          {socials.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {socials.map(([platform, url]) => (
                <a
                  key={platform}
                  href={url as string}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="arcade-press rounded-full border-2 border-edge bg-panel-raised px-4 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-bone hover:text-sun [--press-depth:2px]"
                  style={{ boxShadow: '0 3px 0 var(--color-edge)' }}
                >
                  {platform}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <Panel>
        <PanelBody className="flex flex-col gap-6">
          <RecordBar wins={profile.wins} draws={profile.draws} losses={profile.losses} />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Battles" value={profile.totalBattles} />
            <StatTile label="Win rate" value={`${profile.winRate}%`} />
            <StatTile label="Total XP" value={profile.totalXp} />
            <StatTile label="Streak" value={profile.currentStreak} />
            <StatTile label="Best streak" value={profile.highestStreak} />
            <StatTile label="Votes won" value={profile.totalVotesReceived} />
          </div>
        </PanelBody>
      </Panel>

      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Portfolio</p>
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
              Finished work
            </h2>
          </div>
          {work.length > 0 ? (
            <p className="font-mono text-xs text-bone-faint">
              {work.length} {work.length === 1 ? 'piece' : 'pieces'}
              {models.length > 0 ? ` · ${models.length} with models` : ''}
            </p>
          ) : null}
        </div>

        {work.length === 0 ? (
          <Panel>
            <EmptyState
              title="Nothing to show yet"
              description={`Work appears here once a challenge ${profile.username} entered has finished voting. Entries in a live challenge stay hidden so the ballot stays blind.`}
            />
          </Panel>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {work.map((item) => (
              <WorkCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HeroStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div
      className="rounded-2xl border-[3px] border-edge bg-void/70 px-4 py-3 text-center backdrop-blur-sm"
      style={{ boxShadow: '0 4px 0 var(--color-edge)' }}
    >
      <p className="eyebrow text-[0.625rem]">{label}</p>
      <p className={`font-display text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function WorkCard({ item }: { item: PortfolioItem }) {
  return (
    <TiltCard
      className="rounded-[20px]"
      // The offset shadow is the design language's depth cue; the tilt adds real
      // perspective on top of it rather than replacing it.
    >
      <Link
        href={`/challenges/${item.challengeSlug}`}
        className="group flex h-full flex-col overflow-hidden rounded-[20px] border-4 border-edge bg-panel-raised"
        style={{ boxShadow: '0 6px 0 var(--color-edge)' }}
      >
        <div className="relative aspect-square overflow-hidden border-b-4 border-edge bg-void">
          {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
          <img
            src={item.imageUrl}
            alt={`Entry for ${item.challengeTitle}`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />

          {item.isWinner ? (
            <span
              className="absolute left-3 top-3 rounded-full border-2 border-edge bg-sun px-2.5 py-0.5 font-display text-[0.6875rem] font-bold uppercase tracking-wider text-edge"
              style={{ boxShadow: '0 3px 0 var(--color-edge)' }}
            >
              Winner
            </span>
          ) : null}

          {item.modelUrl ? (
            <span className="absolute right-3 top-3 rounded-full border-2 border-aqua/60 bg-void/85 px-2.5 py-0.5 font-display text-[0.6875rem] font-bold uppercase tracking-wider text-aqua">
              3D
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="font-display text-base font-bold uppercase leading-tight tracking-tight text-bone transition-colors group-hover:text-sun">
            {item.challengeTitle}
          </h3>

          <div className="mt-auto flex items-center justify-between font-mono text-xs text-bone-faint">
            <span>{formatDate(item.submittedAt)}</span>
            <span className="flex items-center gap-1.5 text-sun">
              <FireIcon size={16} /> {item.voteCount}
            </span>
          </div>
        </div>
      </Link>
    </TiltCard>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <Skeleton className="h-72 w-full rounded-[28px]" />
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="aspect-square w-full rounded-[20px]" />
        ))}
      </div>
    </div>
  );
}
