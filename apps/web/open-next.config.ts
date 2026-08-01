import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Adapts the Next.js build for the Workers runtime.
 *
 * Deliberately minimal. The optional caches OpenNext can wire up (incremental
 * cache on R2, tag cache on D1, queue on Durable Objects) exist to make ISR and
 * `revalidateTag` work across isolates — and this app has neither. Every page
 * that shows data is a client component fed by React Query against the API, so
 * there is no Next-side data cache to persist and nothing to invalidate. Adding
 * those bindings would mean provisioning an R2 bucket and a D1 database that no
 * code path ever reads.
 *
 * Revisit this the moment a route starts using `revalidate` or `revalidateTag`.
 */
export default defineCloudflareConfig();
