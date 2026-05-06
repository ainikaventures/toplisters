/**
 * Tiny sitemap.xml fetcher and parser. Sitemaps follow a fixed shape
 * (sitemaps.org schema), so a regex pass is sufficient — no XML library
 * dependency. Handles both `<urlset>` and `<sitemapindex>` documents,
 * with one level of recursion through indexes.
 */

import { USER_AGENT } from "./http";

interface SitemapEntry {
  url: string;
  lastmod: Date | null;
}

const LOC_RE = /<loc>([^<]+)<\/loc>/g;
const URL_BLOCK_RE = /<url>([\s\S]*?)<\/url>/g;
const SITEMAP_BLOCK_RE = /<sitemap>([\s\S]*?)<\/sitemap>/g;
const LASTMOD_RE = /<lastmod>([^<]+)<\/lastmod>/;
const SINGLE_LOC_RE = /<loc>([^<]+)<\/loc>/;

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/xml,text/xml,*/*" },
  });
  if (!response.ok) {
    throw new Error(`Sitemap fetch failed: ${url} → ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function parseLastmod(value: string | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseUrlset(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  for (const match of Array.from(xml.matchAll(URL_BLOCK_RE))) {
    const block = match[1];
    const loc = SINGLE_LOC_RE.exec(block)?.[1]?.trim();
    if (!loc) continue;
    const lastmod = parseLastmod(LASTMOD_RE.exec(block)?.[1]);
    out.push({ url: loc, lastmod });
  }
  return out;
}

function parseSitemapIndex(xml: string): string[] {
  const out: string[] = [];
  for (const match of Array.from(xml.matchAll(SITEMAP_BLOCK_RE))) {
    const loc = SINGLE_LOC_RE.exec(match[1])?.[1]?.trim();
    if (loc) out.push(loc);
  }
  return out;
}

function isSitemapIndex(xml: string): boolean {
  // `<sitemapindex>` always opens before any `<urlset>` for index docs;
  // checking the first 4kB avoids false positives from comments.
  const head = xml.slice(0, 4096);
  return /<sitemapindex\b/.test(head);
}

/**
 * Walks one or more sitemap URLs and returns a flat list of detail-page
 * URLs (with their `lastmod` if present). Recurses into nested sitemap
 * indexes one level deep — fine for every job board I've seen.
 */
export async function discoverUrls(sitemapUrls: readonly string[]): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [];
  const seen = new Set<string>();

  for (const sitemapUrl of sitemapUrls) {
    if (seen.has(sitemapUrl)) continue;
    seen.add(sitemapUrl);
    const xml = await fetchText(sitemapUrl);

    if (isSitemapIndex(xml)) {
      const childUrls = parseSitemapIndex(xml);
      for (const child of childUrls) {
        if (seen.has(child)) continue;
        seen.add(child);
        const childXml = await fetchText(child);
        // Defence-in-depth: a malformed index could nest indexes. Treat a
        // second-level `<sitemapindex>` as the leaf and walk its <loc>s
        // anyway via the urlset parser fallthrough.
        if (isSitemapIndex(childXml)) {
          for (const loc of parseSitemapIndex(childXml)) {
            entries.push({ url: loc, lastmod: null });
          }
        } else {
          entries.push(...parseUrlset(childXml));
        }
      }
    } else {
      entries.push(...parseUrlset(xml));
    }
  }

  return entries;
}

export type { SitemapEntry };
export { LOC_RE };
