"use client";

import { useEffect } from "react";
import Script from "next/script";

/**
 * Optional analytics. Both PostHog and GA4 load conditionally based on env
 * vars — leave them blank in .env to disable everything. PostHog is the
 * spec's primary choice (privacy-friendlier, EU host by default, generous
 * 1M-events/month free tier); GA4 sits alongside for users who want
 * Google's reach + Search Console correlation.
 *
 * Both load with the `afterInteractive` strategy so they don't block the
 * initial paint. PostHog's SPA pageview tracking is on by default and
 * picks up Next.js client-side navigation; GA4 captures the initial PV
 * via gtag('config') — extending to SPA navigation can be added later if
 * the data shows we need it.
 */
const POSTHOG_HOST_DEFAULT = "https://eu.i.posthog.com";

function PostHog() {
  useEffect(() => {
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
  }, []);

  return null;
}

function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_ID;
  if (!id) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">{`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}', { send_page_view: true });
`}</Script>
    </>
  );
}

export function Analytics() {
  return (
    <>
      <PostHog />
      <GoogleAnalytics />
    </>
  );
}
