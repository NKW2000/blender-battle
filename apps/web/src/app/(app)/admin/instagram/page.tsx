'use client';

import { Difficulty, Role } from '@bb/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import {
  InstagramPostComposer,
  type PostPrefill,
} from '@/components/admin/instagram-post-composer';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, Panel } from '@/components/ui/panel';
import { useSession } from '@/features/auth/use-session';
import { safeImageUrl } from '@/lib/instagram-post';

/**
 * Turns a challenge reference into a finished Instagram post.
 *
 * The whole thing runs in the browser: the image is read from the operator's
 * own file, composited on a canvas and downloaded. There is no endpoint behind
 * this page and nothing is stored, which is why it needed no API change and no
 * migration — and why artwork for an unannounced challenge never leaves the
 * machine of whoever is making the post.
 */
/*
  `useSearchParams` opts a page into dynamic rendering unless it sits under a
  Suspense boundary, and this page is otherwise static. The boundary is here
  rather than around the whole route so the guard and the header still render
  immediately.
*/
export default function AdminInstagramPage() {
  return (
    <Suspense fallback={null}>
      <AdminInstagramView />
    </Suspense>
  );
}

/** Reads a link's parameters into the composer's starting values. */
function usePrefill(): PostPrefill | undefined {
  const params = useSearchParams();
  if (![...params.keys()].length) return undefined;

  const text = (key: string) => params.get(key) ?? undefined;

  const difficulty = text('difficulty');
  const votes = text('votes');
  const parsedVotes = votes !== undefined && /^\d+$/.test(votes) ? Number(votes) : undefined;

  return {
    kind: text('kind') === 'winner' ? 'winner' : text('kind') === 'challenge' ? 'challenge' : undefined,
    title: text('title'),
    blurb: text('blurb'),
    // Only a difficulty the product actually defines; a link is user input.
    difficulty: Object.values(Difficulty).includes(difficulty as Difficulty)
      ? (difficulty as Difficulty)
      : undefined,
    handle: text('handle'),
    username: text('username'),
    votes: parsedVotes,
    imageUrl: safeImageUrl(text('image')),
    avatarUrl: safeImageUrl(text('avatar')),
    referenceUrl: safeImageUrl(text('reference')),
  };
}

function AdminInstagramView() {
  const { user } = useSession();
  const prefill = usePrefill();

  /*
    Presentation, not security.

    Consistent with every sibling admin page. There is genuinely nothing to
    protect here — no data is fetched and no endpoint is called — but a
    marketing tool showing up in a player's navigation would be a bug of a
    different kind.
  */
  if (user && user.role !== Role.ADMIN) {
    return (
      <Panel>
        <EmptyState
          title="Admins only"
          description="Making announcement posts is restricted to administrators."
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Administration"
        title="Instagram post"
        description="Upload a challenge reference and get a finished post in the site's own design. Nothing is uploaded — the image is composited here and saved straight to your machine."
      />

      <InstagramPostComposer prefill={prefill} />
    </div>
  );
}
