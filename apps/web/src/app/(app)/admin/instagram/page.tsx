'use client';

import { Role } from '@bb/shared';

import { InstagramPostComposer } from '@/components/admin/instagram-post-composer';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, Panel } from '@/components/ui/panel';
import { useSession } from '@/features/auth/use-session';

/**
 * Turns a challenge reference into a finished Instagram post.
 *
 * The whole thing runs in the browser: the image is read from the operator's
 * own file, composited on a canvas and downloaded. There is no endpoint behind
 * this page and nothing is stored, which is why it needed no API change and no
 * migration — and why artwork for an unannounced challenge never leaves the
 * machine of whoever is making the post.
 */
export default function AdminInstagramPage() {
  const { user } = useSession();

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

      <InstagramPostComposer />
    </div>
  );
}
