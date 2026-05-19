"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics/track";

/**
 * Fires `view_jobs_list` once per mount. Drop into /jobs,
 * /jobs/<country>, and /jobs/<country>/<city>. Returns null —
 * pure side-effect.
 */
export function TrackJobsList(props: {
  listType: "all" | "country" | "city";
  country?: string;
  city?: string;
  totalJobs: number;
}) {
  const { listType, country, city, totalJobs } = props;
  useEffect(() => {
    track("view_jobs_list", {
      list_type: listType,
      country,
      city,
      total_jobs: totalJobs,
    });
  }, [listType, country, city, totalJobs]);
  return null;
}
