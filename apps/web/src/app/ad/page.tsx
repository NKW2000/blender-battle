import type { Metadata } from 'next';

import { AdStage } from '@/components/motion-ad/ad-stage';

/**
 * The trailer.
 *
 * Deliberately outside every route group. `(app)` would redirect a signed-out
 * visitor to the login screen and `(public)` would wrap it in the site header —
 * and a trailer with a navigation bar across the top is not a trailer. Sitting
 * directly under `app/` means it inherits only the root layout: the fonts, the
 * providers, and nothing else.
 *
 * Nothing about the rest of the site changes because of this page. It adds a
 * route and imports existing components; it replaces nothing.
 */
export const metadata: Metadata = {
  title: 'Blender Battle — trailer',
  description:
    'One brief. One deadline. Two artists. Watch a Blender Battle round from match to result.',
  openGraph: {
    title: 'Blender Battle — trailer',
    description: 'One brief. One deadline. Two artists.',
  },
};

export default function AdPage() {
  return <AdStage />;
}
