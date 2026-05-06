import type { $Enums } from "@/lib/generated/prisma/client";

/**
 * Per-site configuration for the generic schema.org JobPosting adapter
 * (`createJsonLdSource`). Adding a new site = adding one entry to
 * `sites.ts`. The factory wires the entry into the existing JobSource
 * registry so kill-switches, scheduling, and analytics work the same way
 * as bespoke adapters.
 */
export interface JsonLdSiteConfig {
  /** Source slug stored in `Job.source`; also drives `DISABLE_SOURCE_<UPPER>`. */
  readonly name: string;
  /** Display name shown in admin / scheduler logs. */
  readonly displayName: string;
  /** Site origin used as the robots.txt base + Referer for fetches. */
  readonly homeUrl: string;
  /**
   * Sitemap URLs to walk. May contain a sitemap index — recursion to a
   * single nested level is supported. .gz sitemaps are NOT supported in
   * this MVP; supply a plain XML URL.
   */
  readonly sitemapUrls: readonly string[];
  /** URLs from the sitemap must match this regex to be treated as detail pages. */
  readonly detailUrlPattern: RegExp;
  /** Hard cap on detail pages fetched per run. Default 50 if omitted. */
  readonly maxUrlsPerRun?: number;
  /**
   * Minimum gap between successive detail-page fetches to the same host
   * in milliseconds. Honored unless robots.txt declares a longer
   * `Crawl-delay`. Default 2000ms.
   */
  readonly crawlDelayMs?: number;
  /** Rendered next to "Apply" on the detail page when set (TOS-friendly). */
  readonly attribution?: string;
  /**
   * Hint for `Job.collarType` when the schema.org payload doesn't carry
   * occupational signal. Defaults to "unknown".
   */
  readonly collarType?: $Enums.CollarType;
  /**
   * Optional default category to apply when `occupationalCategory` /
   * `industry` are missing from the JSON-LD payload.
   */
  readonly defaultCategory?: string;
}

/**
 * The shape `fetch()` returns for one site. `normalize()` is pure and
 * operates on this; doing the I/O in `fetch()` keeps the contract with
 * `runAggregation()` identical to the bespoke adapters.
 */
export interface JsonLdFetchResult {
  readonly site: string;
  readonly items: { url: string; jobPosting: unknown }[];
}
