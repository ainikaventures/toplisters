"use client";

import { useEffect, useRef } from "react";
import { useConsent } from "@/components/consent/ConsentProvider";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * Slot identifier — the value of `data-ad-slot` Google generates when
 * you create an ad unit in the AdSense dashboard. Each placement here
 * maps to one env var so swapping units doesn't require a code change.
 */
export type Placement = "list" | "detail";

const SLOT_ENV: Record<Placement, string | undefined> = {
  list: process.env.NEXT_PUBLIC_ADSENSE_SLOT_LIST,
  detail: process.env.NEXT_PUBLIC_ADSENSE_SLOT_DETAIL,
};

interface AdSlotProps {
  placement: Placement;
  className?: string;
}

/**
 * One responsive AdSense unit. Renders nothing — no skeleton, no
 * reserved empty space — when ads are disabled, the slot ID is
 * unconfigured, or consent has not been granted. When it does render,
 * a small "Advertisement" label sits above the unit (AdSense policy +
 * an obvious courtesy to readers).
 *
 * `min-height: 250px` reserves space proactively so a fill doesn't
 * cause cumulative layout shift below it.
 *
 * Phase-3 sponsored / featured listings will replace these slots; the
 * env switch lets you pull them all instantly when that happens.
 */
export function AdSlot({ placement, className }: AdSlotProps) {
  const { consent } = useConsent();
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const enabled = process.env.NEXT_PUBLIC_ADS_ENABLED === "1";
  const slot = SLOT_ENV[placement];
  const pushed = useRef(false);

  useEffect(() => {
    if (!enabled || !client || !slot || consent !== "granted") return;
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // adsbygoogle.push() throws in dev or before the loader script
      // arrives; both cases self-heal on the next render so we just
      // swallow it rather than spam the console.
    }
  }, [enabled, client, slot, consent]);

  if (!enabled || !client || !slot || consent !== "granted") return null;

  return (
    <div className={`my-8 ${className ?? ""}`}>
      <div className="mb-2 text-center text-[10px] uppercase tracking-[0.18em] text-foreground/40">
        Advertisement
      </div>
      <ins
        className="adsbygoogle"
        style={{ display: "block", minHeight: 250 }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
