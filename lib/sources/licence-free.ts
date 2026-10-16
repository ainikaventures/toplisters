/**
 * Sources we may republish or count publicly (social posts, share-card job
 * counts) without a licence or fee: employers' own public ATS boards +
 * Workable's distribution board (info/COMPLIANCE.md). User-submitted jobs are
 * our own data and are allowed separately via `is_user_submitted`.
 *
 * Never here: licensed / personal-use feeds (Adzuna — which explicitly bans
 * vacancy counts — Reed, Jooble, Findwork, The Muse) and open feeds with
 * unclear or restrictive reuse terms (Arbeitnow, RemoteOK, Remotive).
 *
 * Pure data — imported by both the Next app and the worker.
 */
export const LICENCE_FREE_SOURCES: string[] = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workday",
  "workable",
];
