import { countryName, locationLabel, salaryLabel } from "@/lib/format";
import { slugify } from "@/lib/slug";
import type { Job } from "@/lib/generated/prisma/client";
import type { PostContent } from "./types";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://toplisters.xyz";
const SHORT_MAX_CHARS = 240;

/**
 * Compose platform-neutral post content for a job. Adapters take this
 * `PostContent` and trim / decorate for their own constraints. Keeping
 * one source of truth here means a wording tweak lands everywhere.
 */
export function composePost(job: Job): PostContent {
  const url = `${SITE_URL}/job/${job.id}/${slugify(job.title)}`;
  const location = locationLabel({ city: job.city, countryCode: job.countryCode });
  const salary = salaryLabel(job);

  const headline = `${job.title} — ${job.companyName}`;
  const metaBits = [location, salary, workModeLabel(job.workMode)]
    .filter(Boolean)
    .join(" · ");

  // Short form: headline + meta, trimmed so the URL still fits.
  const shortBody = `${headline}\n${metaBits}`;
  const short = trimToFit(shortBody, SHORT_MAX_CHARS);

  // Long form: a brief excerpt of the description as a third line.
  // Keep it short — most users won't read past the first sentence.
  const excerpt = excerptOf(job.descriptionText, 220);
  const long = excerpt
    ? `${headline}\n${metaBits}\n\n${excerpt}`
    : `${headline}\n${metaBits}`;

  return {
    short,
    long,
    url,
    hashtags: hashtagsFor(job),
  };
}

/**
 * Trim to a hard char cap, breaking on word boundary when possible.
 * Falls back to a hard cut + ellipsis when there's no good break.
 */
function trimToFit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  // Only honor word-boundary if it doesn't drop more than 20% of chars.
  if (lastSpace > max * 0.8) return `${cut.slice(0, lastSpace).trimEnd()}…`;
  return `${cut}…`;
}

function excerptOf(text: string | null | undefined, max: number): string {
  if (!text) return "";
  // Strip excess whitespace, take the first sentence-ish chunk.
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastStop = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
  );
  if (lastStop > max * 0.5) return `${cut.slice(0, lastStop + 1)}`;
  return `${cut.trimEnd()}…`;
}

function workModeLabel(mode: string | null): string {
  switch (mode) {
    case "remote":
      return "Remote";
    case "hybrid":
      return "Hybrid";
    case "onsite":
      return "On-site";
    default:
      return "";
  }
}

/**
 * Tasteful hashtags only — avoid the spammy 10-tag pile. Pick 3:
 * country, work mode, and either the category or "hiring".
 */
function hashtagsFor(job: Job): string[] {
  const tags: string[] = [];
  if (job.countryCode) {
    tags.push(countryHashtag(job.countryCode));
  }
  if (job.workMode === "remote") tags.push("remotework");
  else if (job.workMode === "hybrid") tags.push("hybridwork");
  const cat = (job.category ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (cat && cat.length > 2) tags.push(cat);
  else tags.push("hiring");
  return Array.from(new Set(tags));
}

function countryHashtag(iso2: string): string {
  // Use country name when it's a single word (#Germany), else fall back
  // to "jobsin" + iso2 (#jobsinDE). #UnitedKingdom is fine as one tag.
  const name = countryName(iso2).replace(/[^a-zA-Z]/g, "");
  return name ? `${name}jobs` : `jobsin${iso2}`;
}
