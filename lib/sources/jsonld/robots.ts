/**
 * Minimal robots.txt parser. Walks the rule blocks, picking the most
 * specific User-Agent group that matches our token (or the wildcard `*`
 * group as a fallback), and returns the effective Allow/Disallow rules
 * plus any Crawl-delay.
 *
 * Wildcards (`*`) and end-anchors (`$`) inside rule paths are honoured.
 * No support for sitemap entries (we configure those explicitly) or for
 * the rare `Allow:`-without-`Disallow:` exception precedence games some
 * crawlers play — the rule with the longer path wins, which matches the
 * common interpretation Google documents.
 */

import { USER_AGENT } from "./http";

interface Rule {
  allow: boolean;
  pattern: string;
}

interface RobotsResult {
  allowed: boolean;
  crawlDelayMs: number | null;
}

const TOKEN_RE = /Toplisters/i;

function parsePattern(pattern: string): RegExp {
  // "/api/*" → "^/api/.*"; "/api/$" → "^/api/$"
  let escaped = "";
  for (const ch of pattern) {
    if (ch === "*") escaped += ".*";
    else if (ch === "$") escaped += "$";
    else escaped += ch.replace(/[.+?^=!:${}()|[\]\\/]/g, "\\$&");
  }
  return new RegExp("^" + escaped);
}

interface ParsedRobots {
  rules: Rule[];
  crawlDelayMs: number | null;
}

/**
 * Parses robots.txt and returns the rule set that applies to *us*. We
 * match the first User-Agent group whose token appears in our UA string
 * (case-insensitive), falling back to the wildcard group.
 */
function pickGroup(text: string): ParsedRobots {
  const lines = text.split(/\r?\n/);
  // Each block: list of UAs followed by Allow/Disallow/Crawl-delay rules.
  type Group = { agents: string[]; rules: Rule[]; crawlDelayMs: number | null };
  const groups: Group[] = [];
  let current: Group | null = null;
  let inRules = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!current || inRules) {
        current = { agents: [], rules: [], crawlDelayMs: null };
        groups.push(current);
        inRules = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (field === "allow" || field === "disallow")) {
      inRules = true;
      // Empty Disallow value means "allow everything" → skip; equivalent to no rule.
      if (value) current.rules.push({ allow: field === "allow", pattern: value });
    } else if (current && field === "crawl-delay") {
      inRules = true;
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        current.crawlDelayMs = Math.round(seconds * 1000);
      }
    }
  }

  // Specific group beats wildcard. Match by token contained in either side.
  let chosen: Group | null = null;
  for (const g of groups) {
    if (g.agents.some((a) => a !== "*" && TOKEN_RE.test(a))) {
      chosen = g;
      break;
    }
  }
  if (!chosen) {
    chosen = groups.find((g) => g.agents.includes("*")) ?? null;
  }

  return chosen
    ? { rules: chosen.rules, crawlDelayMs: chosen.crawlDelayMs }
    : { rules: [], crawlDelayMs: null };
}

/**
 * Returns whether a path is allowed under the robots rules. Among
 * matching rules, the longest pattern wins; ties favour Allow.
 */
function isPathAllowed(path: string, rules: readonly Rule[]): boolean {
  let bestMatch: Rule | null = null;
  let bestLen = -1;
  for (const rule of rules) {
    if (parsePattern(rule.pattern).test(path)) {
      if (rule.pattern.length > bestLen || (rule.pattern.length === bestLen && rule.allow)) {
        bestMatch = rule;
        bestLen = rule.pattern.length;
      }
    }
  }
  return bestMatch ? bestMatch.allow : true;
}

/**
 * Fetch + cache the robots.txt for one origin. Cache is process-local;
 * a long-running worker re-uses it across runs of the same source.
 */
const CACHE = new Map<string, ParsedRobots>();

async function fetchRobots(origin: string): Promise<ParsedRobots> {
  const cached = CACHE.get(origin);
  if (cached) return cached;

  const robotsUrl = new URL("/robots.txt", origin).toString();
  let text = "";
  try {
    const response = await fetch(robotsUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/plain" },
    });
    // 404 / 5xx → treat as no robots.txt (fully allowed). Network errors
    // also fall through; we'd rather over-fetch than block on transient
    // failures of an optional input.
    if (response.ok) text = await response.text();
  } catch {
    // Same: leave text empty; caller treats as fully allowed.
  }
  const parsed = pickGroup(text);
  CACHE.set(origin, parsed);
  return parsed;
}

/**
 * Public entrypoint. Given an absolute URL, returns whether we can
 * crawl it under our UA, and the recommended Crawl-delay for the host.
 */
export async function checkRobots(url: string): Promise<RobotsResult> {
  const u = new URL(url);
  const parsed = await fetchRobots(u.origin);
  const path = u.pathname + (u.search || "");
  return {
    allowed: isPathAllowed(path, parsed.rules),
    crawlDelayMs: parsed.crawlDelayMs,
  };
}

export type { RobotsResult };
