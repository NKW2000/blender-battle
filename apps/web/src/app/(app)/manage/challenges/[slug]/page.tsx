'use client';

import { CHALLENGE_MAX_ASSETS, ChallengeAssetType, ChallengeStatus } from '@bb/shared';
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

export default function EditChallengePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data: challenge, isLoading, isError } = useChallenge(slug);
  const update = useUpdateChallenge(slug);
  const upload = useUploadChallengeAsset(slug);
  const removeAsset = useRemoveChallengeAsset(slug);
  const { publish, archive } = useChallengeLifecycle();

  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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
  const atAssetLimit = challenge.assets.length >= CHALLENGE_MAX_ASSETS;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`Editing · ${challenge.status}`}
        title={challenge.title}
        action={

        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/challenges/${challenge.slug}`}>View</Link>
          </Button>
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
      <div className="flex max-w-3xl flex-col gap-8">
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
            <ul className="grid gap-3 sm:grid-cols-2">
              {challenge.assets.map((asset) => (
                <li
                  key={asset.id}
                  className="flex items-center justify-between gap-3 border border-edge p-2"
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
            <input
              ref={fileInput}
              type="file"
              accept=".zip,.blend,application/zip"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  upload.mutate({
                    id: challenge.id,
                    file,
                    type: ChallengeAssetType.REFERENCE_FILE,
                  });
                }
                event.target.value = '';
              }}
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => imageInput.current?.click()}
              disabled={upload.isPending || atAssetLimit}
            >
              {upload.isPending ? 'Uploading…' : 'Add image'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
              disabled={upload.isPending || atAssetLimit}
            >
              Add file
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
