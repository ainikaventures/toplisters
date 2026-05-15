"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * First-party pageview beacon. Fires once per pathname change with
 * `navigator.sendBeacon` so navigations are non-blocking and survive
 * page unload. The /api/track endpoint enriches with country
 * (CF-IPCountry) and a daily-rotating visitor hash — see
 * lib/pageviews.ts for the cookieless-tracking rationale.
 *
 * Deliberately NOT consent-gated: this is server-side aggregated
 * counting with no PII at rest and no cross-day identifier, which
 * sits under legitimate interest in GDPR/ePrivacy. The consent-gated
 * tools (GA4 ad-storage, PostHog, Clarity) are wired separately in
 * [Analytics.tsx](Analytics.tsx).
 */
export function TrackPageview() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (last.current === pathname) return;
    last.current = pathname;

    const payload = JSON.stringify({ path: pathname });
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/track", blob);
        return;
      }
    } catch {
      /* fall through to fetch */
    }

    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* swallow — analytics never blocks UX */
    });
  }, [pathname]);

  return null;
}
