/**
 * Registered sites for the schema.org JobPosting adapter. Adding a new
 * site = adding one entry here + one import line in `lib/sources/index.ts`.
 *
 * Pre-flight checklist before adding a site:
 *   1. Confirm the site emits `<script type="application/ld+json">` with
 *      `@type: "JobPosting"` on detail pages. View-source to verify.
 *   2. Confirm robots.txt doesn't disallow the detail-page path for our UA.
 *   3. Confirm there's a public, non-gzipped sitemap URL listing detail
 *      pages (or a sitemap index that recurses to one).
 *   4. Set a sensible `detailUrlPattern` so we skip category, company, and
 *      static pages from the sitemap.
 *   5. Set `crawlDelayMs` ≥ 2000 ms unless the site is known to handle
 *      faster (we'd rather under-fetch than have our UA blacklisted).
 *   6. Default `maxUrlsPerRun` to 50; bump only if the site has many
 *      fresh postings per day and the schedule cadence makes that fit.
 */

import type { JsonLdSiteConfig } from "./types";

export const JSON_LD_SITES: readonly JsonLdSiteConfig[] = [
  {
    // Remotive — curated remote-work board with clean schema.org JSON-LD on
    // every detail page. Sitemap index lives at /sitemap.xml; the postings
    // sitemap is /sitemap-job-postings-1.xml. URL pattern looks like
    // /remote-jobs/<category>/<slug>-<numeric-id>.
    name: "remotive",
    displayName: "Remotive",
    homeUrl: "https://remotive.com",
    sitemapUrls: ["https://remotive.com/sitemap-job-postings-1.xml"],
    detailUrlPattern: /^https:\/\/remotive\.com\/remote-jobs\/[^/]+\/[^/]+$/,
    crawlDelayMs: 2000,
    maxUrlsPerRun: 50,
    attribution: "via Remotive",
    collarType: "white",
    defaultCategory: "remote",
  },
];
