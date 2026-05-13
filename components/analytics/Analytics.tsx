"use client";

import { useEffect } from "react";
import Script from "next/script";
import { useConsent } from "@/components/consent/ConsentProvider";

/**
 * Analytics architecture:
 * - PostHog: gated entirely on consent. Script not loaded at all until accept.
 * - GA4: uses Google Consent Mode v2. Script loads unconditionally (so Tag
 *   Assistant / "Test your website" can detect it), but tracking is initialized
 *   in `denied` state. No cookies are set, no PII leaves the browser, until
 *   the user accepts the consent banner — at which point we fire
 *   `gtag('consent', 'update', { ... granted })` and tracking begins.
 *   EU/UK opt-in compliant; matches Google's recommended pattern.
 * - Microsoft Clarity: session recordings + heatmaps. No Consent Mode
 *   equivalent, and it records pixel-level interactions, so it's fully
 *   consent-gated like PostHog — the script is not injected at all until
 *   the user accepts.
 */
const POSTHOG_HOST_DEFAULT = "https://eu.i.posthog.com";

function PostHog() {
  const { consent } = useConsent();
  useEffect(() => {
    if (consent !== "granted") return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    let cancelled = false;
    void import("posthog-js").then((mod) => {
      if (cancelled) return;
      const posthog = mod.default;
      if (
        (posthog as unknown as { __loaded?: boolean }).__loaded ||
        typeof window === "undefined"
      ) {
        return;
      }
      posthog.init(key, {
        api_host:
          process.env.NEXT_PUBLIC_POSTHOG_HOST ?? POSTHOG_HOST_DEFAULT,
        capture_pageview: true,
        person_profiles: "identified_only",
      });
    });

    return () => {
      cancelled = true;
    };
  }, [consent]);

  return null;
}

function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_ID;
  const { consent } = useConsent();

  // Whenever consent changes, sync to gtag's Consent Mode.
  useEffect(() => {
    if (!id) return;
    if (typeof window === "undefined") return;
    const w = window as unknown as { gtag?: (...args: unknown[]) => void };
    if (!w.gtag) return;
    const granted = consent === "granted";
    w.gtag("consent", "update", {
      analytics_storage: granted ? "granted" : "denied",
      ad_storage: granted ? "granted" : "denied",
      ad_user_data: granted ? "granted" : "denied",
      ad_personalization: granted ? "granted" : "denied",
    });
  }, [id, consent]);

  if (!id) return null;
  return (
    <>
      {/* Bootstrap: define gtag stub + set Consent Mode v2 default to denied,
          THEN load gtag.js. The stub queues events into dataLayer; gtag.js
          processes the queue in order, so consent default is honored. */}
      <Script id="ga-bootstrap" strategy="afterInteractive">{`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  wait_for_update: 500,
});
gtag('js', new Date());
gtag('config', '${id}', { send_page_view: true });
`}</Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
    </>
  );
}

function Clarity() {
  const id = process.env.NEXT_PUBLIC_CLARITY_ID;
  const { consent } = useConsent();
  if (!id || consent !== "granted") return null;
  return (
    <Script id="ms-clarity" strategy="afterInteractive">{`
(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${id}");
`}</Script>
  );
}

export function Analytics() {
  // GA4 loads unconditionally (Consent Mode v2 controls actual tracking).
  // PostHog + Clarity gate internally on consent.
  return (
    <>
      <PostHog />
      <GoogleAnalytics />
      <Clarity />
    </>
  );
}
