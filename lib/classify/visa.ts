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
  /\b(visa sponsorship|sponsorship (is )?(available|offered|provided)|will sponsor|we sponsor|able to sponsor|skilled worker( visa)?|tier 2|certificate of sponsorship|\bcos\b|blue card|critical skills|relocation (assistance|provided|package|support))\b/i;

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
