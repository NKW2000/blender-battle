'use client';

import { ChallengeAssetType, ChallengeStatus, Role } from '@bb/shared';
import Link from 'next/link';
import { use } from 'react';

import { DifficultyBadge, StatusBadge } from '@/components/challenges/challenge-card';
import { ScheduleEventPanel } from '@/components/challenges/schedule-event-panel';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel, PanelBody, PanelHeader, PanelTitle, Skeleton } from '@/components/ui/panel';
import { useSession } from '@/features/auth/use-session';
import { useChallenge, useChallengeLifecycle } from '@/features/challenges/use-challenges';
import { formatDate } from '@/lib/utils';

export default function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // A brief is for reading, so the field thins out and slows down.

  const { slug } = use(params);
  const { user } = useSession();
  const { data: challenge, isLoading, isError } = useChallenge(slug);
  const { publish, archive } = useChallengeLifecycle();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !challenge) {
    return (
      <Panel>
        <EmptyState
          title="No such challenge"
          description="This brief may have been removed, or it was never published."
          action={
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href="/challenges">Back to the catalogue</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  const canEdit =
    user?.role === Role.ADMIN || (user?.role === Role.MANAGER && user.id === challenge.author.id);
  const images = challenge.assets.filter((a) => a.type === ChallengeAssetType.REFERENCE_IMAGE);
  const files = challenge.assets.filter((a) => a.type === ChallengeAssetType.REFERENCE_FILE);

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/challenges" className="eyebrow hover:text-select">
            ← Catalogue
          </Link>
          <span className="eyebrow">{challenge.category.name}</span>
          <DifficultyBadge difficulty={challenge.difficulty} />
          {challenge.status !== ChallengeStatus.PUBLISHED ? (
            <StatusBadge status={challenge.status} />
          ) : null}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="max-w-2xl font-display text-3xl font-bold uppercase leading-[1.05] tracking-tight text-bone">
            {challenge.title}
          </h1>

          {canEdit ? (
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/manage/challenges/${challenge.slug}`}>Edit</Link>
              </Button>
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
                  size="sm"
                  onClick={() => publish.mutate(challenge.id)}
                  disabled={publish.isPending}
                >
                  Publish
                </Button>
              )}
            </div>
          ) : null}
        </div>

        <dl className="flex flex-wrap gap-6 font-mono text-xs text-bone-faint">
          <div className="flex gap-2">
            <dt>Time</dt>
            <dd className="text-bone">{challenge.estimatedMinutes} min</dd>
          </div>
          <div className="flex gap-2">
            <dt>Reward</dt>
            <dd className="text-select">{challenge.rewardXp} XP</dd>
          </div>
          {challenge.blenderVersion ? (
            <div className="flex gap-2">
              <dt>Blender</dt>
              <dd className="text-bone">{challenge.blenderVersion}</dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt>By</dt>
            <dd className="text-bone">
              <Link href={`/u/${challenge.author.username}`} className="hover:text-select">
                {challenge.author.username}
              </Link>
            </dd>
          </div>
          {challenge.publishedAt ? (
            <div className="flex gap-2">
              <dt>Published</dt>
              <dd className="text-bone">{formatDate(challenge.publishedAt)}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      {/* Scheduling is a manager/admin operation on any published brief, not just
          one's own — unlike editing the content, which stays author-scoped. */}
      {(user?.role === Role.MANAGER || user?.role === Role.ADMIN) &&
      challenge.status === ChallengeStatus.PUBLISHED ? (
        <ScheduleEventPanel challengeId={challenge.id} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader>
              <PanelTitle>Brief</PanelTitle>
            </PanelHeader>
            <PanelBody>
              <p className="whitespace-pre-line text-sm leading-relaxed text-bone-muted">
                {challenge.description}
              </p>
            </PanelBody>
          </Panel>

          {images.length > 0 ? (
            <Panel>
              <PanelHeader>
                <PanelTitle>Reference</PanelTitle>
              </PanelHeader>
              <PanelBody className="grid gap-3 sm:grid-cols-2">
                {images.map((asset) => (
                  // eslint-disable-next-line @next/next/no-img-element -- Cloudinary-sized asset
                  <img
                    key={asset.id}
                    src={asset.url}
                    alt={asset.filename}
                    className="w-full border border-edge object-cover"
                  />
                ))}
              </PanelBody>
            </Panel>
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          {challenge.objectives.length > 0 ? (
            <Panel>
              <PanelHeader>
                <PanelTitle>Judged on</PanelTitle>
              </PanelHeader>
              <PanelBody>
                <ul className="flex flex-col gap-2">
                  {challenge.objectives.map((objective) => (
                    <li key={objective} className="flex gap-3 text-sm text-bone">
                      <span className="mt-[0.4rem] h-1 w-1 shrink-0 bg-select" aria-hidden="true" />
                      {objective}
                    </li>
                  ))}
                </ul>
              </PanelBody>
            </Panel>
          ) : null}

          {challenge.rules || challenge.allowedAssets || challenge.forbiddenAssets ? (
            <Panel>
              <PanelHeader>
                <PanelTitle>Rules</PanelTitle>
              </PanelHeader>
              <PanelBody className="flex flex-col gap-4 text-sm">
                {challenge.rules ? (
                  <p className="whitespace-pre-line text-bone-muted">{challenge.rules}</p>
                ) : null}
                {challenge.allowedAssets ? (
                  <div>
                    <p className="eyebrow">Allowed</p>
                    <p className="mt-1 text-bone-muted">{challenge.allowedAssets}</p>
                  </div>
                ) : null}
                {challenge.forbiddenAssets ? (
                  <div>
                    <p className="eyebrow">Not allowed</p>
                    <p className="mt-1 text-bone-muted">{challenge.forbiddenAssets}</p>
                  </div>
                ) : null}
              </PanelBody>
            </Panel>
          ) : null}

          {files.length > 0 ? (
            <Panel>
              <PanelHeader>
                <PanelTitle>Files</PanelTitle>
              </PanelHeader>
              <PanelBody className="flex flex-col gap-2">
                {files.map((asset) => (
                  <a
                    key={asset.id}
                    href={asset.url}
                    download
                    rel="noopener noreferrer nofollow"
                    className="flex items-center justify-between gap-3 border border-edge px-3 py-2 font-mono text-xs text-bone-muted hover:border-select hover:text-select"
                  >
                    <span className="truncate">{asset.filename}</span>
                    <span className="shrink-0">{Math.round(asset.bytes / 1024)} KB</span>
                  </a>
                ))}
              </PanelBody>
            </Panel>
          ) : null}

          {challenge.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {challenge.tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/challenges?tag=${tag.slug}`}
                  className="border border-edge px-2 py-1 font-mono text-xs text-bone-faint hover:border-select hover:text-select"
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </article>
  );
}
