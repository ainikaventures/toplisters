/**
 * Visa-sponsorship signal from a job description.
 *
 * Maps onto the existing `Job.visaSponsorship` boolean (no migration):
 *   true  → "offered", false → "not_offered", null → "unknown".
 *
 * Conservative: an explicit positive with no explicit negative is "offered";
 * an explicit negative with no positive is "not_offered"; conflicting or
 * silent descriptions stay "unknown". Run in the pipeline over every source.
 */

const OFFERED =
  /\b((?<!no )(?<!not )(visa sponsorship|sponsorship (is )?(available|offered|provided))|will sponsor|we sponsor|(?<!un)(?<!not )able to sponsor|skilled worker( visa)?|tier 2|certificate of sponsorship|\bcos\b|blue card|critical skills|relocation (assistance|provided|package|support))\b/i;

const NOT_OFFERED =
  /\b(no sponsorship|cannot sponsor|can'?t sponsor|will not sponsor|unable to sponsor|not able to sponsor|do not (offer|provide) sponsorship|no visa( sponsorship)?|must (already )?have (the )?right to work|right to work (in [\w\s]+ )?is required)\b/i;

export type VisaSponsor = "offered" | "not_offered" | "unknown";

/** true = offered, false = not_offered, null = unknown. */
export function detectVisaSponsorship(text: string | null | undefined): boolean | null {
  if (!text) return null;
  const offered = OFFERED.test(text);
  const notOffered = NOT_OFFERED.test(text);
  if (offered && !notOffered) return true;
  if (notOffered && !offered) return false;
  return null;
}

export function visaSponsorLabel(value: boolean | null | undefined): VisaSponsor {
  return value === true ? "offered" : value === false ? "not_offered" : "unknown";
}

/** Extract the sentence around the first regex hit, as human-readable evidence. */
function evidenceSnippet(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  if (!m) return null;
  const idx = m.index;
  const start = Math.max(0, text.lastIndexOf(".", idx) + 1);
  let end = text.indexOf(".", idx + m[0].length);
  if (end === -1) end = Math.min(text.length, idx + m[0].length + 140);
  return text.slice(start, end + 1).replace(/\s+/g, " ").trim().slice(0, 240) || null;
}

export interface VisaSponsorDetail {
  /** true = offered, false = not_offered, null = unknown. */
  value: boolean | null;
  label: VisaSponsor;
  /** The sentence from the description that drove the call (null if unknown). */
  details: string | null;
}

/**
 * Like detectVisaSponsorship, but also returns the supporting sentence so an
 * API consumer can see *why* — and read the specifics (e.g. "Tier 2 / Skilled
 * Worker visa available"). Computed on read from the description.
 */
export function detectVisaSponsorshipDetail(
  text: string | null | undefined,
): VisaSponsorDetail {
  if (!text) return { value: null, label: "unknown", details: null };
  const offered = OFFERED.test(text);
  const notOffered = NOT_OFFERED.test(text);
  let value: boolean | null = null;
  let re: RegExp | null = null;
  if (offered && !notOffered) {
    value = true;
    re = OFFERED;
  } else if (notOffered && !offered) {
    value = false;
    re = NOT_OFFERED;
  }
  return {
    value,
    label: visaSponsorLabel(value),
    details: re ? evidenceSnippet(text, re) : null,
  };
}
