"use client";

import Script from "next/script";
import { useConsent } from "@/components/consent/ConsentProvider";

/**
 * Loads the AdSense script exactly once, only when:
 *   1. NEXT_PUBLIC_ADS_ENABLED === "1" (master kill-switch)
 *   2. NEXT_PUBLIC_ADSENSE_CLIENT is set (the `ca-pub-…` publisher ID)
 *   3. The user has clicked Accept on the cookie-consent banner
 *
 * Mounted once in the root layout, alongside <Analytics />. Each
 * <AdSlot> on the page is responsible for *requesting fill* via
 * `adsbygoogle.push({})` after this script lands — see AdSlot.tsx.
 *
 * Manual placements only — we never enable Auto Ads, Anchor, or
 * Vignette ads (those are the annoying ones).
 */
export function AdsLoader() {
  const { consent } = useConsent();
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const enabled = process.env.NEXT_PUBLIC_ADS_ENABLED === "1";

  if (!enabled || !client || consent !== "granted") return null;

  return (
    <Script
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
      strategy="afterInteractive"
      crossOrigin="anonymous"
    />
  );
}
