/**
 * Generic enrichment helper: takes a job-board URL (Adzuna redirect, etc.),
 * follows redirects to the final landing page, and tries to pull a full
 * schema.org/JobPosting JSON-LD block out of the resulting HTML.
 *
 * Designed for sources whose API ships only a truncated description (Adzuna
 * is the canonical case — their docs explicitly say "we currently only
 * provide a snippet"). When the final page exposes JSON-LD, we get the real
 * description PLUS the canonical employer host as a free side-effect.
 *
 * Returns `null` on any failure — fetch error, non-2xx, missing/empty
 * JSON-LD, malformed description. Callers should keep their original
 * snippet in that case (no regression).
 */

import { extractJobPostings } from "./jsonld/extract";
import { USER_AGENT } from "./jsonld/http";
import { cleanHtml, htmlToPlainText } from "./utils";

const FETCH_TIMEOUT_MS = 8000;

export interface JobPostingEnrichment {
  /** Final URL after following redirects — usually the employer's careers page. */
  finalUrl: string;
  /** Sanitized HTML description. */
  descriptionHtml: string;
  /** Plaintext description (for FTS + meta descriptions). */
  descriptionText: string;
  /** Resolved company host from the final URL, e.g. "stripe.com". May be null
   *  if the landing page is on a job-board aggregator's own host. */
  companyDomain: string | null;
}

const AGGREGATOR_HOSTS = new Set([
  "adzuna.com", "adzuna.co.uk", "adzuna.de", "adzuna.fr", "adzuna.it",
  "adzuna.nl", "adzuna.pl", "adzuna.ch", "adzuna.at", "adzuna.be",
  "adzuna.in", "adzuna.sg", "adzuna.com.br", "adzuna.com.mx",
  "adzuna.co.nz", "adzuna.co.za", "adzuna.com.au", "adzuna.ca",
  "indeed.com", "linkedin.com", "glassdoor.com", "ziprecruiter.com",
]);

function pickCompanyDomain(finalUrl: string): string | null {
  try {
    const host = new URL(finalUrl).hostname.replace(/^www\./, "");
    if (AGGREGATOR_HOSTS.has(host)) return null;
    return host;
  } catch {
    return null;
  }
}

export async function enrichFromUrl(
  url: string,
): Promise<JobPostingEnrichment | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const html = await response.text();
    const finalUrl = response.url || url;

    const postings = extractJobPostings(html);
    if (postings.length === 0) return null;

    const node = postings[0] as { description?: unknown };
    const desc = typeof node.description === "string" ? node.description : null;
    if (!desc) return null;
    const trimmed = desc.trim();
    if (trimmed.length === 0) return null;

    return {
      finalUrl,
      descriptionHtml: cleanHtml(trimmed),
      descriptionText: htmlToPlainText(trimmed),
      companyDomain: pickCompanyDomain(finalUrl),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run `enrichFromUrl` over a list of URLs with a bounded concurrency. Returns
 * results in the same order as the input (null where enrichment failed).
 *
 * Concurrency is global, not per-host. For the Adzuna case this is fine —
 * its 50 results/page spread across many employers — but adapters that
 * cluster on a small set of hosts (e.g. an ATS-by-slug source) should
 * either skip enrichment or add per-host gating before adopting this.
 */
export async function enrichMany(
  urls: readonly string[],
  concurrency = 4,
): Promise<(JobPostingEnrichment | null)[]> {
  const results: (JobPostingEnrichment | null)[] = new Array(urls.length).fill(null);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= urls.length) return;
      results[i] = await enrichFromUrl(urls[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
