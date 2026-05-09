import type { JobSource } from "./types";
import { remoteOK } from "./remoteok";
import { arbeitnow } from "./arbeitnow";
import { reed } from "./reed";
import { theMuse } from "./themuse";
import { adzuna } from "./adzuna";
import { jooble } from "./jooble";
import { findwork } from "./findwork";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { createJsonLdSource } from "./jsonld/source";
import { JSON_LD_SITES } from "./jsonld/sites";

/**
 * Registry of all known job sources. Adding a new source = adding one import
 * + one entry here, per the spec's plugin pattern.
 *
 * The schema.org JSON-LD generic adapter expands one entry per configured
 * site (see `jsonld/sites.ts`); each shows up as its own source in the
 * registry, with its own `DISABLE_SOURCE_<UPPER>` kill-switch.
 *
 * Sources are kept in the registry whether or not they're currently enabled
 * via env var; the pipeline calls `isEnabled()` to decide what to run.
 */
const jsonLdSources = JSON_LD_SITES.map(createJsonLdSource);

export const sources: readonly JobSource[] = [
  remoteOK,
  arbeitnow,
  reed,
  theMuse,
  adzuna,
  jooble,
  findwork,
  greenhouse,
  lever,
  ...jsonLdSources,
];

export function getSource(name: string): JobSource | undefined {
  return sources.find((s) => s.name === name);
}

export function enabledSources(): JobSource[] {
  return sources.filter((s) => s.isEnabled());
}

export type { JobSource, NormalizedJob } from "./types";
