/**
 * Pull schema.org JobPosting JSON-LD blocks out of an HTML page.
 *
 * JSON-LD scripts on real-world pages come in three shapes; we accept all:
 *   1. A single object: `{ "@type": "JobPosting", … }`
 *   2. An array: `[{ "@type": "JobPosting", … }, { "@type": "Organization" }]`
 *   3. A graph wrapper: `{ "@graph": [{ "@type": "JobPosting" }, …] }`
 *
 * Multi-typed nodes (`"@type": ["JobPosting", "…"]`) also count as a hit.
 *
 * Returns an empty array when no JobPosting block is present (the page
 * may not be a job detail page after all).
 */

const SCRIPT_RE =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function isJobPostingType(value: unknown): boolean {
  if (typeof value === "string") return value === "JobPosting";
  if (Array.isArray(value)) return value.some((v) => v === "JobPosting");
  return false;
}

function collectFromNode(node: unknown, out: unknown[]): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (isJobPostingType(obj["@type"])) out.push(obj);
  // Schema.org @graph wrapper — flatten one level.
  const graph = obj["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) collectFromNode(item, out);
  }
}

export function extractJobPostings(html: string): unknown[] {
  const out: unknown[] = [];
  for (const match of Array.from(html.matchAll(SCRIPT_RE))) {
    const raw = (match[1] ?? "").trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Some sites embed unescaped HTML entities or stray comments. Skip
      // rather than fail the whole page — a job board with malformed
      // JSON-LD on one listing usually has clean JSON-LD on the next.
      continue;
    }
    if (Array.isArray(parsed)) {
      for (const item of parsed) collectFromNode(item, out);
    } else {
      collectFromNode(parsed, out);
    }
  }
  return out;
}
