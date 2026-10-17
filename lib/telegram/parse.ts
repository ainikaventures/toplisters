/**
 * Free-text bot query → structured search. Pure (no DB): city names are
 * resolved later in search.ts against the GeoNames table.
 *
 *   "python developer london remote"  → words "python developer london", remote
 *   "nurse jobs in uae with visa"     → words "nurse", country AE, sponsor
 *   "/jobs india"                     → country IN
 */

export interface ParsedQuery {
  /** Remaining keywords (role / skills / possibly a city). */
  words: string[];
  countryCode: string | null;
  workMode: "remote" | "hybrid" | "onsite" | null;
  sponsor: boolean;
}

const STOPWORDS = new Set([
  "job", "jobs", "in", "at", "near", "for", "role", "roles", "vacancy", "vacancies",
  "hiring", "find", "show", "me", "the", "a", "an", "with", "and", "of", "any", "latest", "new",
  "opening", "openings", "position", "positions", "work", "career", "careers",
]);

const WORK_MODE: Record<string, ParsedQuery["workMode"]> = {
  remote: "remote",
  wfh: "remote",
  "work-from-home": "remote",
  hybrid: "hybrid",
  onsite: "onsite",
  "on-site": "onsite",
  office: "onsite",
};

const SPONSOR = new Set(["sponsor", "sponsorship", "sponsored", "visa", "visas"]);

/** Common names people type that Intl's English names don't cover. */
const COUNTRY_ALIASES: Record<string, string> = {
  uk: "GB", britain: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB",
  usa: "US", america: "US", "united states": "US", "united states of america": "US",
  uae: "AE", emirates: "AE", "united arab emirates": "AE",
  ksa: "SA", saudi: "SA", "saudi arabia": "SA",
  holland: "NL", deutschland: "DE", "south korea": "KR", korea: "KR",
  "czech republic": "CZ", russia: "RU", vietnam: "VN", turkey: "TR",
};

let countryNames: Map<string, string> | null = null;

/** Lowercased English country name → ISO-2, built once from Intl. */
function countryMap(): Map<string, string> {
  if (countryNames) return countryNames;
  const map = new Map<string, string>(Object.entries(COUNTRY_ALIASES));
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      let name: string | undefined;
      try {
        name = names.of(code);
      } catch {
        continue;
      }
      // Intl echoes unknown codes back; skip those.
      if (name && name !== code) {
        const key = name.toLowerCase();
        if (!map.has(key)) map.set(key, code);
      }
    }
  }
  countryNames = map;
  return map;
}

/** Look up an explicit country argument (name, alias or ISO-2 code). */
export function resolveCountry(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const hit = countryMap().get(s);
  if (hit) return hit;
  if (/^[a-z]{2}$/.test(s)) {
    const code = s.toUpperCase();
    return [...countryMap().values()].includes(code) ? code : null;
  }
  return null;
}

export function parseQuery(text: string): ParsedQuery {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.\- ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12);

  let workMode: ParsedQuery["workMode"] = null;
  let sponsor = false;
  const rest: string[] = [];
  for (const t of tokens) {
    if (WORK_MODE[t]) workMode = WORK_MODE[t];
    else if (SPONSOR.has(t)) sponsor = true;
    else rest.push(t);
  }

  // Country: longest match of 1–4 consecutive tokens, anywhere.
  let countryCode: string | null = null;
  const map = countryMap();
  outer: for (let len = 4; len >= 1; len--) {
    for (let i = 0; i + len <= rest.length; i++) {
      const phrase = rest.slice(i, i + len).join(" ");
      const hit = map.get(phrase);
      // Two-letter tokens only count via the alias table ("uk", "us"), so
      // words like "it" or "in" are never read as countries.
      if (hit && (len > 1 || phrase.length > 2 || COUNTRY_ALIASES[phrase])) {
        countryCode = hit;
        rest.splice(i, len);
        break outer;
      }
    }
  }

  return {
    words: rest.filter((w) => !STOPWORDS.has(w)),
    countryCode,
    workMode,
    sponsor,
  };
}
