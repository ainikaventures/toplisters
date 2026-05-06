/**
 * Shared HTTP constants + helpers used across the JSON-LD adapter modules.
 */

export const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
