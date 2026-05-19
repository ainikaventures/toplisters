/**
 * Centralized client-side event tracking. Forwards every call to both
 * GA4 (via window.gtag) and PostHog (via window.posthog), each of which
 * handles its own consent gating:
 *
 *   - GA4 ships unconditionally with Consent Mode v2 set to `denied`,
 *     so pre-consent events queue + are dropped, post-consent events
 *     flow normally.
 *   - PostHog is dynamic-imported only after the user grants consent
 *     (Analytics.tsx), and attaches itself to window.posthog on init.
 *     Pre-consent calls find no `posthog.capture` and silently no-op.
 *
 * Safe to call from anywhere on the client. No-op on SSR.
 */

export type TrackParams = Record<
  string,
  string | number | boolean | null | undefined
>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    posthog?: {
      capture?: (event: string, params?: TrackParams) => void;
    };
  }
}

function compact(params?: TrackParams): TrackParams {
  if (!params) return {};
  const out: TrackParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

export function track(name: string, params?: TrackParams): void {
  if (typeof window === "undefined") return;
  const clean = compact(params);
  try {
    if (window.gtag) window.gtag("event", name, clean);
  } catch {
    // ignore — analytics must never break the page
  }
  try {
    if (window.posthog?.capture) window.posthog.capture(name, clean);
  } catch {
    // ignore
  }
}
