import { RouteLoader } from '@/components/ui/route-loader';

/** Shown while a public route streams in. Mirrors the authenticated group. */
export default function Loading() {
  return <RouteLoader />;
}
