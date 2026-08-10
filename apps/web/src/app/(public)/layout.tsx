'use client';

import { AppChrome } from '@/components/layout/app-chrome';

/**
 * The chrome, without the sign-in redirect.
 *
 * Everything under this group renders for a signed-out visitor and for a
 * crawler. That is the whole reason the group exists: a challenge brief and a
 * scheduled event are the only two things anyone links to from outside, and
 * both used to sit behind the authenticated layout, which bounced strangers to
 * `/login` and left search engines with nothing to index.
 *
 * Only put a route here if it genuinely renders without an account. `AppChrome`
 * adapts its nav, but a page that assumes `user` is present will still break.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <AppChrome>{children}</AppChrome>;
}
