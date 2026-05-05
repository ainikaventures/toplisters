"use client";

import { useEffect } from "react";
import Script from "next/script";
import { useConsent } from "@/components/consent/ConsentProvider";

/**
 * Optional analytics. Both PostHog and GA4 load conditionally based on
 * env vars AND on the user's cookie consent — neither script is fetched
 * or executed until the user clicks Accept on the consent banner.
 * Decline / pending → nothing loads, no cookies are set, no network
 * calls to either vendor. EU/UK opt-in compliant by construction.
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
  const { consent } = useConsent();
  if (consent !== "granted") return null;
  return (
    <>
      <PostHog />
      <GoogleAnalytics />
    </>
  );
}
