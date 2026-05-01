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

/** Strip dangerous HTML before persisting. Output is safe to render via dangerouslySetInnerHTML. */
export function cleanHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim();
}

/** Convert HTML to plain text for FTS / meta description / fallbacks. */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  }).trim();
}
