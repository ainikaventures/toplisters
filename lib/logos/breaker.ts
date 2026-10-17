/**
 * Circuit breaker for Logo.dev API calls (brand search + logo download).
 * When Logo.dev says we're out of quota / rate-limited (402, 429) or is
 * failing (5xx), stop calling it for COOLDOWN_MS instead of hammering it on
 * every job in an aggregation run. Per process — the worker and web each
 * trip their own breaker, which is fine.
 */

const COOLDOWN_MS = 60 * 60 * 1000;

let openUntil = 0;

/** True while Logo.dev calls are paused. */
export function logoDevPaused(): boolean {
  return Date.now() < openUntil;
}

/** Record a Logo.dev response status; trips the breaker on quota/server errors. */
export function noteLogoDevStatus(status: number): void {
  if (status === 402 || status === 429 || status >= 500) {
    if (!logoDevPaused()) {
      console.warn(`[logo.dev] HTTP ${status} — pausing Logo.dev calls for ${COOLDOWN_MS / 60000} min`);
    }
    openUntil = Date.now() + COOLDOWN_MS;
  }
}
