'use client';

import { ChallengeAssetType, ChallengeStatus, Role, type ChallengeDetail } from '@bb/shared';
import Link from 'next/link';

import { StatusBadge } from '@/components/challenges/challenge-card';
import {
  BriefCrumbs,
  BriefPanel,
  BriefTitle,
  DifficultyPill,
  Extras,
  JudgedOnPanel,
  ReferencePanel,
} from '@/components/challenges/brief-parts';
import { ScheduleEventPanel } from '@/components/challenges/schedule-event-panel';
import { ChunkyButton } from '@/components/arcade/chunky';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel, Skeleton } from '@/components/ui/panel';
import { useSession } from '@/features/auth/use-session';
import { useChallenge, useChallengeLifecycle } from '@/features/challenges/use-challenges';
import { formatDate } from '@/lib/utils';

/**
 * The interactive half of a brief.
 *
 * Split out of `page.tsx`, which is now a server component: the page renders
 * the brief into the initial HTML and builds `<head>`, and this hydrates on top
 * to add the manager controls and keep the data fresh.
 *
 * `initialChallenge` is the copy the server already fetched. Seeding the query
 * with it means no loading flash on first paint and no second request for data
 * that is already on the page.
 *
 * The panels come from `brief-parts`, shared with `/events/[id]`. This screen
 * was left on the old flat surfaces when that one was rebuilt to the design, so
 * the same challenge looked like two different products depending on which link
 * you followed to reach it.
 */
export function ChallengeDetailView({
  slug,
  initialChallenge,
}: {
  slug: string;
  initialChallenge: ChallengeDetail | null;
}) {
  const { user } = useSession();
  const { data: challenge, isLoading, isError } = useChallenge(slug, initialChallenge ?? undefined);
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
  const references = challenge.assets.filter(
    (asset) => asset.type === ChallengeAssetType.REFERENCE_IMAGE,
  );

  return (
    <article className="flex flex-col gap-[clamp(20px,2.6vw,30px)]">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <BriefCrumbs backHref="/challenges" backLabel="Catalogue" category={challenge.category.name}>
            <DifficultyPill difficulty={challenge.difficulty} />
            {challenge.status !== ChallengeStatus.PUBLISHED ? (
              <StatusBadge status={challenge.status} />
            ) : null}
          </BriefCrumbs>

          <BriefTitle>{challenge.title}</BriefTitle>

          {/*
            Authorship and publication date, which the event screen has no place
            for — there the countdown is the thing worth knowing. They stay a
            plain strip rather than becoming stat tiles: the tiles carry what you
            need to attempt the challenge, and neither of these is that.
          */}
          <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] font-extrabold text-haze-5">
            <div className="flex gap-2">
              <dt>By</dt>
              <dd>
                <Link href={`/u/${challenge.author.username}`} className="text-haze hover:text-sun">
                  {challenge.author.username}
                </Link>
              </dd>
            </div>
            {challenge.publishedAt ? (
              <div className="flex gap-2">
                <dt>Published</dt>
                <dd className="text-haze">{formatDate(challenge.publishedAt)}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {canEdit ? (
          <div className="flex shrink-0 flex-wrap gap-2.5">
            <ChunkyButton asChild tone="cream" size="sm">
              <Link href={`/manage/challenges/${challenge.slug}`}>Edit</Link>
            </ChunkyButton>
            {challenge.status === ChallengeStatus.PUBLISHED ? (
              <ChunkyButton
                tone="ghost"
                size="sm"
                onClick={() => archive.mutate(challenge.id)}
                disabled={archive.isPending}
              >
                Archive
              </ChunkyButton>
            ) : (
              <ChunkyButton
                tone="flame"
                size="sm"
                onClick={() => publish.mutate(challenge.id)}
                disabled={publish.isPending}
              >
                Publish
              </ChunkyButton>
            )}
          </div>
        ) : null}
      </header>

      {/* Scheduling is a manager/admin operation on any published brief, not just
          one's own — unlike editing the content, which stays author-scoped. */}
      {(user?.role === Role.MANAGER || user?.role === Role.ADMIN) &&
      challenge.status === ChallengeStatus.PUBLISHED ? (
        <ScheduleEventPanel challengeId={challenge.id} />
      ) : null}

      {/*
        The design's own brief-and-judging row, at its own proportions. The
        event screen pairs the reference with the upload panel because entering
        is what you came to do; there is nothing to enter here, so the reference
        takes the full width below and gets a larger image for it.
      */}
      <div className="grid grid-cols-1 items-stretch gap-[clamp(14px,1.8vw,24px)] lg:grid-cols-[1.15fr_.85fr]">
        <BriefPanel brief={challenge} />
        {challenge.objectives.length > 0 ? (
          <JudgedOnPanel objectives={challenge.objectives} />
        ) : null}
      </div>

      <ReferencePanel references={references} />

      <Extras brief={challenge} />
    </article>
  );
}
