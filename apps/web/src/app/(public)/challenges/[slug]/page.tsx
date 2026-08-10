import type { ChallengeDetail } from '@bb/shared';
import type { Metadata } from 'next';

import { fetchPublic } from '@/lib/api/server';

import { ChallengeDetailView } from './challenge-detail-view';

/**
 * A challenge brief — server-rendered.
 *
 * This page and the event page are the only two surfaces anyone links to from
 * outside, and both used to be client components inside the authenticated
 * layout: a stranger following a link got a redirect to `/login`, and a crawler
 * got an empty shell. For a product whose stated problem is that nobody can
 * find it, that was working directly against the thing it most needs.
 *
 * So the shell is a server component. It fetches the brief, puts the real text
 * in `<head>` and in the initial HTML, and hands the same object to the client
 * view as seed data — which also removes the loading skeleton on first paint.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const challenge = await fetchPublic<ChallengeDetail>(`/challenges/${slug}`);

  if (!challenge) {
    // Nothing invented. A title claiming a brief exists would be worse than
    // the generic one when the link is genuinely dead.
    return { title: 'Challenge not found · Blender Battle' };
  }

  const description = challenge.shortDescription || challenge.description.slice(0, 200);

  return {
    title: `${challenge.title} · Blender Battle`,
    description,
    openGraph: {
      title: challenge.title,
      description,
      type: 'article',
      // The reference image is the one thing that makes a shared link worth
      // clicking, and it is the same image the brief leads with.
      images: challenge.coverImageUrl ? [{ url: challenge.coverImageUrl }] : undefined,
    },
    twitter: {
      card: challenge.coverImageUrl ? 'summary_large_image' : 'summary',
      title: challenge.title,
      description,
    },
  };
}

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const challenge = await fetchPublic<ChallengeDetail>(`/challenges/${slug}`);

  return <ChallengeDetailView slug={slug} initialChallenge={challenge} />;
}
