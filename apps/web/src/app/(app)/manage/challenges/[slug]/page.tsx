'use client';

import { CHALLENGE_MAX_ASSETS, ChallengeAssetType, ChallengeStatus, Role } from '@bb/shared';
import Link from 'next/link';
import { use, useRef } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { ChallengeForm } from '@/components/challenges/challenge-form';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel, PanelBody, PanelHeader, PanelTitle, Skeleton } from '@/components/ui/panel';
import {
  useChallenge,
  useChallengeLifecycle,
  useRemoveChallengeAsset,
  useUpdateChallenge,
  useUploadChallengeAsset,
} from '@/features/challenges/use-challenges';
import { useSession } from '@/features/auth/use-session';
import { instagramPostHref } from '@/lib/instagram-post';

export default function EditChallengePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { user } = useSession();
  const { data: challenge, isLoading, isError } = useChallenge(slug);
  const update = useUpdateChallenge(slug);
  const upload = useUploadChallengeAsset(slug);
  const removeAsset = useRemoveChallengeAsset(slug);
  const { publish, archive } = useChallengeLifecycle();

  const imageInput = useRef<HTMLInputElement>(null);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  if (isError || !challenge) {
    return (
      <Panel>
        <EmptyState
          title="No such challenge"
          description="It may have been removed, or you may not have permission to edit it."
          action={
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href="/challenges">Back to the catalogue</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  const isPublished = challenge.status === ChallengeStatus.PUBLISHED;

  // The first reference is what the post should lead with; the cover is the
  // fallback for a brief that has not had one attached yet.
  const reference = challenge.assets.find((asset) => asset.type === ChallengeAssetType.REFERENCE_IMAGE);
  const atAssetLimit = challenge.assets.length >= CHALLENGE_MAX_ASSETS;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`Editing · ${challenge.status}`}
        title={challenge.title}
        action={

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/challenges/${challenge.slug}`}>View</Link>
          </Button>

          {/*
            Announcing the brief, from the screen where it was written.

            The title, difficulty, summary and first reference are all here
            already, so the composer opens filled in. Administrators only,
            because that is who the composer itself admits — offering a manager
            a button to a page that will turn them away is worse than not
            offering it.
          */}
          {user?.role === Role.ADMIN ? (
            <Button asChild variant="ghost" size="sm">
              <Link
                href={instagramPostHref({
                  kind: 'challenge',
                  title: challenge.title,
                  blurb: challenge.shortDescription,
                  difficulty: challenge.difficulty,
                  imageUrl: reference?.url ?? challenge.coverImageUrl,
                  category: challenge.category.name,
                  duration: challenge.estimatedMinutes,
                })}
              >
                Instagram post
              </Link>
            </Button>
          ) : null}
          {isPublished ? (
            <Button
              variant="outline"
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
              {publish.isPending ? 'Publishing…' : 'Publish'}
            </Button>
          )}
        </div>
        }
      />

      {/* The header spans the page like every other screen; the editor does not.
          A brief is a column of text inputs, and stretching them to 1150px makes
          them harder to read, not more consistent. */}
      <div className="flex w-full min-w-0 max-w-3xl flex-col gap-8">
      <Panel>
        <PanelHeader>
          <PanelTitle>Attachments</PanelTitle>
          <span className="font-mono text-xs text-bone-faint">
            {challenge.assets.length}/{CHALLENGE_MAX_ASSETS}
          </span>
        </PanelHeader>

        <PanelBody className="flex flex-col gap-4">
          {challenge.assets.length === 0 ? (
            <p className="text-sm text-bone-muted">
              No reference yet. The first image also becomes the card cover.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {challenge.assets.map((asset) => (
                <li
                  key={asset.id}
                  /*
                    `min-w-0` is what makes the `truncate` below work.

                    This is a grid item, and a grid item's `min-width` defaults
                    to `auto`, meaning "do not shrink below your content". The
                    filename is a 60-character Cloudinary key with no spaces, so
                    the row grew to fit it, the panel grew to fit the row, and
                    the whole page scrolled sideways on a phone — with every
                    other panel squeezed into what was left.
                  */
                  className="flex min-w-0 items-center justify-between gap-3 rounded-[14px] border-[2.5px] border-ink bg-white/5 p-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {asset.type === ChallengeAssetType.REFERENCE_IMAGE ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset
                      <img
                        src={asset.url}
                        alt=""
                        className="h-12 w-12 shrink-0 border border-edge object-cover"
                      />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-edge font-mono text-[0.625rem] text-bone-faint">
                        FILE
                      </span>
                    )}
                    <span className="truncate font-mono text-xs text-bone-muted">
                      {asset.filename}
                    </span>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${asset.filename}`}
                    onClick={() =>
                      removeAsset.mutate({ id: challenge.id, assetId: asset.id })
                    }
                    disabled={removeAsset.isPending}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <input
              ref={imageInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  upload.mutate({
                    id: challenge.id,
                    file,
                    type: ChallengeAssetType.REFERENCE_IMAGE,
                  });
                }
                event.target.value = '';
              }}
            />
            {/*
              Images only.

              A brief attached a .blend or a .zip as a "reference file", which
              is a starter scene by another name — and a contest where some
              entrants began from the author's geometry and others from a cube
              is not measuring the same thing for both. Reference *images* say
              what to build; a reference file hands over part of the building.

              The asset type still exists and existing files still render and
              download, so nothing already attached is orphaned. What is gone is
              the way to add more.
            */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => imageInput.current?.click()}
              disabled={upload.isPending || atAssetLimit}
            >
              {upload.isPending ? 'Uploading…' : 'Add image'}
            </Button>
          </div>

          {atAssetLimit ? (
            <p className="font-mono text-xs text-bone-faint">
              Attachment limit reached. Remove one to add another.
            </p>
          ) : null}
        </PanelBody>
      </Panel>

      <ChallengeForm
        challenge={challenge}
        submitLabel="Save changes"
        isSubmitting={update.isPending}
        onSubmit={(payload) => update.mutate({ id: challenge.id, data: payload })}
      />
      </div>
    </div>
  );
}
