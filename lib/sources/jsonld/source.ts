/**
 * Generic schema.org JobPosting adapter factory. Each call returns a
 * `JobSource` instance for one configured site (one per entry in
 * `sites.ts`), so the existing `DISABLE_SOURCE_<UPPER>` kill-switch and
 * scheduler-cadence patterns work without any changes upstream.
 *
 * Run flow:
 *   sitemap → URL filter → robots.txt → polite per-host fetch with delay
 *   → JSON-LD JobPosting extraction → normalization
 *
 * Per-host concurrency is held at 1: detail pages are fetched in series
 * with a `crawlDelayMs` gap (configured per site, or honouring whatever
 * robots.txt declares as `Crawl-delay`, whichever is longer).
 */

import type { JobSource, NormalizedJob } from "../types";
import type { JsonLdFetchResult, JsonLdSiteConfig } from "./types";
import { discoverUrls, type SitemapEntry } from "./sitemap";
import { checkRobots } from "./robots";
import { extractJobPostings } from "./extract";
import { normalizeJobPosting } from "./normalize";
import { USER_AGENT, sleep } from "./http";

const DEFAULT_MAX_URLS = 50;
const DEFAULT_CRAWL_DELAY_MS = 2000;

async function fetchHtml(url: string, referer: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        Referer: referer,
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export function createJsonLdSource(config: JsonLdSiteConfig): JobSource {
  const envKey = `DISABLE_SOURCE_${config.name.toUpperCase()}`;

  return {
    name: config.name,
    displayName: config.displayName,
    attribution: config.attribution,
    providerUrl: config.homeUrl,

    isEnabled(): boolean {
      return process.env[envKey] !== "1";
    },

    async fetch(): Promise<JsonLdFetchResult> {
      const entries = await discoverUrls(config.sitemapUrls);
      const filtered = entries.filter((e: SitemapEntry) =>
        config.detailUrlPattern.test(e.url),
      );
      // Most-recent first so a constrained run still ingests fresh postings.
      // URLs without a lastmod sort to the end (lastmod === null treated as 0).
      filtered.sort(
        (a, b) =>
          (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0),
      );
      const cap = config.maxUrlsPerRun ?? DEFAULT_MAX_URLS;
      const targets = filtered.slice(0, cap);

      const items: JsonLdFetchResult["items"] = [];
      const baseDelay = config.crawlDelayMs ?? DEFAULT_CRAWL_DELAY_MS;
      let robotsDelayMs = 0;
      let robotsChecked = false;

      for (const entry of targets) {
        const robots = await checkRobots(entry.url);
        if (!robotsChecked) {
          robotsChecked = true;
          robotsDelayMs = robots.crawlDelayMs ?? 0;
        }
        if (!robots.allowed) {
          // Site has explicitly opted out for our UA on this path. Skip
          // silently — the rest of the sitemap may still be crawlable.
          continue;
        }

        const html = await fetchHtml(entry.url, config.homeUrl);
        if (html) {
          const postings = extractJobPostings(html);
          for (const posting of postings) {
            items.push({ url: entry.url, jobPosting: posting });
          }
        }

        // Honour the longer of our configured delay and any robots Crawl-delay.
        await sleep(Math.max(baseDelay, robotsDelayMs));
      }

      return { site: config.name, items };
    },

    normalize(raw: unknown): NormalizedJob[] {
      const result = raw as JsonLdFetchResult | null;
      if (!result || !Array.isArray(result.items)) return [];
      const out: NormalizedJob[] = [];
      const seen = new Set<string>();
      for (const item of result.items) {
        const job = normalizeJobPosting(item.jobPosting, item.url, config);
        if (!job) continue;
        // Same posting can appear in multiple JSON-LD blocks on the same
        // page (e.g., a list view linking back to itself). Dedupe by
        // sourceId before the pipeline sees it.
        if (seen.has(job.sourceId)) continue;
        seen.add(job.sourceId);
        out.push(job);
      }
      return out;
    },
  };
}
