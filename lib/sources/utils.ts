import { createHash } from "node:crypto";
import { convert } from "html-to-text";
import sanitizeHtml from "sanitize-html";

/**
 * Dedupe key per spec line 120:
 *   SHA1( lower(title) + "|" + lower(company) + "|" + countryCode + "|" + (city || "") )
 *
 * `countryCode` is the ISO-2 we resolved via geocoding (or "ZZ" for unknown);
 * `city` is the canonical city name from GeoNames or null when only the
 * country resolved. Cross-source duplicates (same role posted on multiple
 * boards) collide intentionally.
 */
export function computeDedupeHash(
  title: string,
  companyName: string,
  countryCode: string | null,
  city: string | null,
): string {
  const key = [
    title.trim().toLowerCase(),
    companyName.trim().toLowerCase(),
    countryCode ?? "",
    city ?? "",
  ].join("|");
  return createHash("sha1").update(key).digest("hex");
}

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "ul", "ol", "li",
    "strong", "em", "b", "i", "u",
    "a", "blockquote", "code", "pre",
    "table", "thead", "tbody", "tr", "th", "td",
    "img",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel"],
    img: ["src", "alt", "title"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "nofollow noopener noreferrer", target: "_blank" }),
  },
};

const NAMED_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** One decoding pass. Single regex sweep, so `&amp;lt;` decodes to `&lt;`
 *  (one level) rather than collapsing straight to `<`. */
function decodeEntitiesOnce(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X"
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

const ESCAPED_TAG = /&lt;\s*\/?\s*[a-zA-Z][^&]*?&gt;/g;
const REAL_TAG = /<\s*\/?\s*[a-zA-Z][^>]*>/g;

/**
 * Undo entity-encoded markup.
 *
 * Several feeds hand us HTML that has already been escaped — the whole
 * description arrives as `&lt;p&gt;&lt;strong&gt;About…`. sanitize-html
 * treats that as text (correctly — they aren't tags), so it survived
 * cleaning and then rendered as literal `<p>` on the job page. Measured
 * Aug 2026: 21 of 60 sampled live listings were affected.
 *
 * Only decodes when the escaped tags OUTNUMBER real ones, so a description
 * that legitimately shows markup in a code sample alongside real HTML is
 * left alone. Bounded loop handles double-encoding (`&amp;lt;p&amp;gt;`).
 *
 * Safe by construction: decoding happens BEFORE sanitizeHtml, so a hidden
 * `&lt;script&gt;` becomes a real <script> tag and is then stripped by the
 * sanitizer — it is never handed to the browser.
 */
export function decodeEscapedHtml(input: string): string {
  let working = input;
  for (let pass = 0; pass < 3; pass++) {
    const escaped = (working.match(ESCAPED_TAG) ?? []).length;
    const real = (working.match(REAL_TAG) ?? []).length;

    if (escaped > real) {
      working = decodeEntitiesOnce(working);
      continue;
    }

    // Nothing escaped at this level, but the content may be double-encoded
    // (`&amp;lt;p&amp;gt;`). Trial-decode one pass and keep it only if that
    // actually reveals more escaped markup — so ordinary text containing a
    // literal "&amp;" is never quietly rewritten.
    const trial = decodeEntitiesOnce(working);
    if ((trial.match(ESCAPED_TAG) ?? []).length > escaped) {
      working = trial;
      continue;
    }
    break;
  }
  return working;
}

/** Strip dangerous HTML before persisting. Output is safe to render via dangerouslySetInnerHTML. */
export function cleanHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(decodeEscapedHtml(html), SANITIZE_OPTIONS).trim();
}

/** Convert HTML to plain text for FTS / meta description / fallbacks. */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  // Same un-escaping, or the "plain text" keeps literal <p> markers in it.
  return convert(decodeEscapedHtml(html), {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  }).trim();
}
