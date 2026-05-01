import type { $Enums } from "@/lib/generated/prisma/client";

/**
 * Shape produced by a `JobSource.normalize()` call. These are the fields the
 * source itself can determine. The pipeline (scripts/run-source.ts) layers
 * geocoding (lat/lng + canonical city/country) and the dedupe hash on top
 * before persisting.
 */
export interface NormalizedJob {
  source: string;
  sourceId: string;
  title: string;
  companyName: string;
  companyDomain: string | null;
  locationText: string;
  applyUrl: string;
  descriptionHtml: string;
  descriptionText: string;
  postedDate: Date;
  closingDate: Date | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: $Enums.SalaryPeriod | null;
  jobType: $Enums.JobType;
  workMode: $Enums.WorkMode;
  experienceLevel: $Enums.ExperienceLevel;
  category: string;
  collarType: $Enums.CollarType;
  skills: string[];
  benefits: string[];
  visaSponsorship: boolean | null;
}

/**
 * One job-board adapter. Each implementation lives in its own file under
 * `lib/sources/` and is registered via `lib/sources/index.ts`.
 *
 * - `name` is the slug used in env vars (DISABLE_SOURCE_<UPPER>) and as
 *   `Job.source` in the database.
 * - `attribution` is rendered near the listing on the job detail page when
 *   the source's TOS requires it (e.g. Adzuna). Optional otherwise.
 * - `fetch()` returns the raw API payload (any shape — adapter-specific).
 *   Network errors / non-2xx should throw so the pipeline can decide how to
 *   back off.
 * - `normalize(raw)` converts that payload into our schema. Pure function,
 *   no I/O — keeps the worker pipeline easy to reason about.
 */
export interface JobSource {
  readonly name: string;
  readonly displayName: string;
  readonly attribution?: string;
  isEnabled(): boolean;
  fetch(): Promise<unknown>;
  normalize(raw: unknown): NormalizedJob[];
}
