/**
 * Match an employer name against the UK Register of Licensed Sponsors.
 *
 * The register has ~142k organisations. A naive substring `includes()` is the
 * trap the spec warns about — "sky" hits 200+ unrelated firms. Instead we
 * tokenise both sides, strip corporate noise words, and require either an
 * EXACT token-set match or a contiguous-prefix match anchored on a RARE token,
 * so short generic names can't over-match.
 *
 * Tiers (first hit wins):
 *   high   — exact token-set match (order-insensitive)
 *   medium — one name is a contiguous prefix of the other, anchored on a token
 *            that appears in ≤ DISTINCT_MAX organisations (distinctive)
 *   low    — same as medium but the prefix hits multiple distinct orgs
 *   (none) — not on the register ⇒ employer definitely can't sponsor
 */

// Corporate suffixes / fillers dropped before matching. Kept deliberately
// tight — stripping too much ("services", "global") would shorten names into
// over-matching territory.
const STOPWORDS = new Set([
  "ltd", "limited", "plc", "llp", "llc", "inc", "incorporated",
  "co", "company", "group", "holdings", "holding", "uk", "gb", "the", "and",
]);

const DISTINCT_MAX = 25;

export type SponsorRating = "A" | "B" | null;
export type MatchConfidence = "high" | "medium" | "low";

export interface SponsorRow {
  name: string;
  route: string;
  rating: SponsorRating;
}

interface IndexEntry {
  key: string; // sorted normalised tokens, joined — the org identity
  tokens: string[]; // normalised tokens in original order
  routes: string[];
  rating: SponsorRating;
}

export interface SponsorIndex {
  byKey: Map<string, IndexEntry>;
  byToken: Map<string, IndexEntry[]>;
  tokenDocCount: Map<string, number>;
  size: number;
}

export interface MatchResult {
  licensed: boolean;
  routes: string[];
  rating: SponsorRating;
  confidence: MatchConfidence | null;
}

/** Lowercase, strip punctuation, drop corporate stopwords → tokens. */
export function normaliseTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

function bestRating(ratings: SponsorRating[]): SponsorRating {
  if (ratings.includes("A")) return "A";
  if (ratings.includes("B")) return "B";
  return null;
}

/** Build the lookup index from register rows (one row per org+route). */
export function buildSponsorIndex(rows: SponsorRow[]): SponsorIndex {
  const byKey = new Map<string, IndexEntry>();
  for (const row of rows) {
    const tokens = normaliseTokens(row.name);
    if (!tokens.length) continue;
    const key = [...tokens].sort().join(" ");
    let entry = byKey.get(key);
    if (!entry) {
      entry = { key, tokens, routes: [], rating: null };
      byKey.set(key, entry);
    }
    if (row.route && !entry.routes.includes(row.route)) entry.routes.push(row.route);
    entry.rating = bestRating([entry.rating, row.rating]);
  }

  const byToken = new Map<string, IndexEntry[]>();
  const tokenDocCount = new Map<string, number>();
  for (const entry of byKey.values()) {
    for (const t of new Set(entry.tokens)) {
      (byToken.get(t) ?? byToken.set(t, []).get(t)!).push(entry);
      tokenDocCount.set(t, (tokenDocCount.get(t) ?? 0) + 1);
    }
  }
  return { byKey, byToken, tokenDocCount, size: byKey.size };
}

/** Is `a` a contiguous prefix of `b` (from the start)? */
function isPrefix(a: string[], b: string[]): boolean {
  if (a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function matchEmployer(index: SponsorIndex, name: string | null | undefined): MatchResult {
  const empty: MatchResult = { licensed: false, routes: [], rating: null, confidence: null };
  const tokens = normaliseTokens(name);
  if (!tokens.length) return empty;

  // Tier 1: exact token-set match.
  const exact = index.byKey.get([...tokens].sort().join(" "));
  if (exact) {
    return { licensed: true, routes: exact.routes, rating: exact.rating, confidence: "high" };
  }

  // Tier 2/3: contiguous-prefix anchored on the job's RAREST token, gated by
  // distinctiveness so generic tokens ("sky") can't drag in unrelated firms.
  let anchor = tokens[0];
  let anchorCount = index.tokenDocCount.get(anchor) ?? Infinity;
  for (const t of tokens) {
    const c = index.tokenDocCount.get(t) ?? Infinity;
    if (c < anchorCount) {
      anchor = t;
      anchorCount = c;
    }
  }
  if (anchorCount > DISTINCT_MAX) return empty;

  const matches = (index.byToken.get(anchor) ?? []).filter(
    (e) => isPrefix(tokens, e.tokens) || isPrefix(e.tokens, tokens),
  );
  if (!matches.length) return empty;

  const distinct = new Set(matches.map((m) => m.key));
  return {
    licensed: true,
    routes: [...new Set(matches.flatMap((m) => m.routes))],
    rating: bestRating(matches.map((m) => m.rating)),
    confidence: distinct.size === 1 ? "medium" : "low",
  };
}
