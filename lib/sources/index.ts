import type { JobSource } from "./types";
import { remoteOK } from "./remoteok";

/**
 * Registry of all known job sources. Adding a new source = adding one import
 * + one entry here, per the spec's plugin pattern.
 *
 * Sources are kept in the registry whether or not they're currently enabled
 * via env var; the pipeline calls `isEnabled()` to decide what to run.
 */
export const sources: readonly JobSource[] = [remoteOK];

export function getSource(name: string): JobSource | undefined {
  return sources.find((s) => s.name === name);
}

export function enabledSources(): JobSource[] {
  return sources.filter((s) => s.isEnabled());
}

export type { JobSource, NormalizedJob } from "./types";
