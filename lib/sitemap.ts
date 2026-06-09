/**
 * Shared sitemap constants.
 *
 * Lives outside the route modules because Next.js 14 only allows a fixed
 * set of exports from a `route.ts` (GET/POST/…, `dynamic`, `revalidate`,
 * etc.). `JOBS_PER_SHARD` is imported by both /sitemap.xml (the index) and
 * /sitemap/[id] (the shards), so it has to be a plain module export.
 */

/** Job URLs per sitemap shard. Crawlers cap a single sitemap at 50k URLs. */
export const JOBS_PER_SHARD = 40000;
