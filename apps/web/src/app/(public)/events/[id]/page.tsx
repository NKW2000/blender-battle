import type { Metadata } from 'next';

import type { EventDetail } from '@/features/challenges/use-events';
import { fetchPublic } from '@/lib/api/server';

import { EventDetailView } from './event-detail-view';

/**
 * A scheduled challenge event — server-rendered.
 *
 * The most shareable page in the product, and until now the least shareable: it
 * lived behind the authenticated layout and its API endpoint required a token,
 * so a link posted anywhere led a stranger to `/login` and a crawler to
 * nothing. Both are now public.
 *
 * The server fetch is unauthenticated by construction, which is exactly right —
 * what a viewer may see of the entries depends on the event's phase and not on
 * who they are, so the anonymous render is the correct shared shape. The two
 * viewer-specific fields are filled in when the client query refetches.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await fetchPublic<EventDetail>(`/challenge-events/${id}`);

  if (!event) return { title: 'Challenge not found · Blender Battle' };

  /*
    The phase goes in the description because it is what decides whether the
    link is worth opening now. "Voting is open" and "Finished" are different
    invitations, and a static blurb would misrepresent one of them every time
    the event moved on.
  */
  const status =
    event.phase === 'open'
      ? 'Entries are open'
      : event.phase === 'voting'
        ? 'Voting is open'
        : event.phase === 'upcoming'
          ? 'Starting soon'
          : 'Finished';

  const description = `${status} — ${event.shortDescription}`;

  return {
    title: `${event.title} · Blender Battle`,
    description,
    openGraph: {
      title: event.title,
      description,
      type: 'article',
      images: event.coverImageUrl ? [{ url: event.coverImageUrl }] : undefined,
    },
    twitter: {
      card: event.coverImageUrl ? 'summary_large_image' : 'summary',
      title: event.title,
      description,
    },
  };
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await fetchPublic<EventDetail>(`/challenge-events/${id}`);

  return <EventDetailView id={id} initialEvent={event} />;
}
