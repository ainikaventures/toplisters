/**
 * "Fit" flags parsed from a job description — hard constraints a candidate
 * (or an auto-apply tool) wants to know up front. Surfaced as a string[] on
 * the API; computed on read from the description, no storage.
 */

const RELOCATION =
  /\b(must relocate|relocation (is )?required|required to relocate|willing(ness)? to relocate|relocate to)\b/i;

const CLEARANCE =
  /\b(security clearance|clearance required|active clearance|sc cleared|dv cleared|secret clearance|top secret|ts\/sci|must be (a |an )?(us |u\.s\. )?citizen|polygraph)\b/i;

const LANG_FLUENCY = /\b(fluent|fluency|native|bilingual|proficiency|proficient|mother ?tongue)\b/i;
const NON_ENGLISH =
  /\b(german|french|spanish|arabic|mandarin|cantonese|chinese|dutch|italian|portuguese|japanese|korean|polish|russian|hindi|turkish|swedish|norwegian|danish|finnish|greek|hebrew|thai|vietnamese|indonesian|malay)\b/i;

export type FitFlag = "relocation_required" | "language_gated" | "clearance_required";

export function detectFitFlags(text: string | null | undefined): FitFlag[] {
  if (!text) return [];
  const flags: FitFlag[] = [];
  if (RELOCATION.test(text)) flags.push("relocation_required");
  if (LANG_FLUENCY.test(text) && NON_ENGLISH.test(text)) flags.push("language_gated");
  if (CLEARANCE.test(text)) flags.push("clearance_required");
  return flags;
}
