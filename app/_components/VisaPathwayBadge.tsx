import type { Job } from "@/lib/generated/prisma/client";
import { computeVisaPathways, type VisaPathway } from "@/lib/classify/visa-pathways";

/**
 * Highlights the freedom-oriented visa pathway a role can lead to (Task 9).
 * Shows the strongest applicable scheme — high-freedom (PR / self-sponsored /
 * portable) routes get a green ⭐ badge; sponsor-tied routes a muted one.
 */

const SHORT: Record<string, string> = {
  "Scale-up Worker": "Scale-up",
  "Skilled Worker": "Skilled Worker",
  "Critical Skills Employment Permit": "Critical Skills",
  "Express Entry (FSW)": "Express Entry",
  "Skilled Independent 189": "Skilled Independent 189",
  "Green Visa (self-sponsored)": "Green Visa",
  "EU Blue Card": "Blue Card",
  "Opportunity Card": "Opportunity Card",
};

function flagEmoji(cc: string | null): string {
  if (!cc || cc.length !== 2) return "";
  return cc
    .toUpperCase()
    .replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Strongest pathway: prefer a high-freedom one whose salary gate isn't failed. */
function strongest(pathways: VisaPathway[]): VisaPathway | null {
  return (
    pathways.find((p) => p.freedom === "high" && p.threshold_met !== false) ??
    pathways.find((p) => p.threshold_met !== false) ??
    pathways[0] ??
    null
  );
}

export function VisaPathwayBadge({ job }: { job: Job }) {
  const { pathways } = computeVisaPathways(job);
  const top = strongest(pathways);
  if (!top) return null;

  const high = top.freedom === "high";
  const label = SHORT[top.name] ?? top.name;

  return (
    <span
      title={`${top.name} — ${top.blurb}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
        high
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-foreground/15 bg-muted text-foreground/70"
      }`}
    >
      <span aria-hidden>{flagEmoji(job.countryCode)}</span>
      {high ? <span aria-hidden>⭐</span> : null}
      <span>
        {label} — {top.blurb}
      </span>
    </span>
  );
}
