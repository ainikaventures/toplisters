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
  {
    // JournalismJobs.com — long-running US journalism / media board with
    // clean schema.org JSON-LD. Detail URLs are /<numeric-id>-<slug>;
    // sitemap also lists /career-advice/* which the regex filters out.
    // The site embeds *its own* logo as `hiringOrganization.logo` when
    // the employer didn't supply one — the normalizer drops same-host
    // logos so the pipeline's Logo.dev fallback can take over.
    name: "journalismjobs",
    displayName: "JournalismJobs",
    homeUrl: "https://www.journalismjobs.com",
    sitemapUrls: ["https://www.journalismjobs.com/sitemap.xml"],
    detailUrlPattern: /^https?:\/\/(www\.)?journalismjobs\.com\/\d+-[a-z0-9-]+$/,
    crawlDelayMs: 2000,
    maxUrlsPerRun: 50,
    attribution: "via JournalismJobs",
    collarType: "white",
    defaultCategory: "media",
  },
  {
    // DesignJobsBoard.com — UK-leaning design board on the WordPress
    // JobBoard plugin. Sitemap is split — the relevant one is
    // /job_listing-sitemap1.xml. Detail URLs are /job/<id>/<slug>/.
    // Quirks (handled in normalize.ts):
    //   - jobLocation.address is a STRING ("London/Hybrid") not a
    //     PostalAddress object → used as locationText directly
    //   - baseSalary is a STRING ("£52-£65k") not a MonetaryAmount object
    //     → silently dropped (we'd need a free-text salary parser to
    //     extract bounds + currency, which is out of scope here)
    //   - identifier.value is the URL itself → used as a stable sourceId
    name: "designjobsboard",
    displayName: "DesignJobsBoard",
    homeUrl: "https://www.designjobsboard.com",
    sitemapUrls: ["https://www.designjobsboard.com/job_listing-sitemap1.xml"],
    detailUrlPattern: /^https?:\/\/(www\.)?designjobsboard\.com\/job\/\d+\/[a-z0-9-]+\/?$/,
    crawlDelayMs: 2000,
    maxUrlsPerRun: 50,
    attribution: "via DesignJobsBoard",
    collarType: "white",
    defaultCategory: "design",
  },
];
