"use client";

import type { ProbabilityEntry } from "@/lib/sports/types";

/** Simple horizontal probability bars — the target highlighted, rivals below. */
export function ProbabilityBars({
  target,
  rivals,
}: {
  target: ProbabilityEntry;
  rivals: ProbabilityEntry[];
}) {
  const rows = [target, ...rivals];
  const max = Math.max(...rows.map((r) => r.probability), 0.01);
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.id} className="flex items-center gap-3">
          <span
            className={`w-28 shrink-0 truncate text-sm sm:w-36 ${
              i === 0 ? "font-semibold" : "text-foreground/70"
            }`}
          >
            {r.name}
          </span>
          <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-md transition-[width]"
              style={{
                width: `${Math.max((r.probability / max) * 100, 1.5)}%`,
                background: i === 0 ? "var(--tl-blue, #1F6FEB)" : "var(--foreground)",
                opacity: i === 0 ? 1 : 0.55,
              }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-sm tabular-nums">
            {(r.probability * 100).toFixed(1)}%
          </span>
        </li>
      ))}
    </ul>
  );
}
