"use client";

import { useRouter, usePathname } from "next/navigation";
import { countryName } from "@/lib/format";
import { DEFAULT_RANGE, RANGE_OPTIONS } from "../_data/ranges";

/**
 * Auto-submitting filter bar. Same pattern as the listings filter:
 * dropdowns commit on change via router.replace so the back button
 * doesn't fill with one entry per fiddle.
 */
export function AnalyticsFilters({
  range,
  country,
  availableCountries,
}: {
  range: string;
  country: string | null;
  availableCountries: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  function commit(next: { range?: string; country?: string }) {
    const params = new URLSearchParams();
    const nextRange = next.range ?? range;
    const nextCountry = next.country ?? country ?? "";
    if (nextRange !== DEFAULT_RANGE) params.set("range", nextRange);
    if (nextCountry) params.set("country", nextCountry);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">
          Time range
        </span>
        <select
          value={range}
          onChange={(e) => commit({ range: e.target.value })}
          className="rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
        >
          {RANGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">
          Country
        </span>
        <select
          value={country ?? ""}
          onChange={(e) => commit({ country: e.target.value })}
          className="rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
        >
          <option value="">All countries</option>
          {availableCountries.map((code) => (
            <option key={code} value={code}>
              {countryName(code)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
