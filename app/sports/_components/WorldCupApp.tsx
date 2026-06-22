"use client";

import { useEffect, useMemo, useState } from "react";
import { worldCupEngine, groupTables, type WcData } from "@/lib/sports/worldcup/engine";
import type { AnalysisResult } from "@/lib/sports/types";
import { ResultPanel } from "./ResultPanel";

export function WorldCupApp() {
  const [data, setData] = useState<WcData | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analysing, setAnalysing] = useState(false);

  useEffect(() => {
    worldCupEngine.load().then(setData);
  }, []);

  const tables = useMemo(() => (data ? groupTables(data) : null), [data]);

  function pick(code: string) {
    if (!data) return;
    setPickedId(code);
    setResult(null);
    setAnalysing(true);
    setTimeout(() => {
      setResult(worldCupEngine.analyse(data, code));
      setAnalysing(false);
    }, 20);
  }

  if (!data || !tables) {
    return (
      <div className="rounded-xl border border-foreground/10 p-6 text-sm text-foreground/50">
        Loading groups…
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Groups grid — projected qualifiers marked */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Groups · pick a nation</h2>
          <span className="text-xs text-foreground/50">✓ projected to qualify</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(tables).map(([group, rows]) => (
            <div key={group} className="overflow-hidden rounded-xl border border-foreground/10">
              <div className="border-b border-foreground/10 bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/60">
                Group {group}
              </div>
              <ul>
                {rows.map((row) => (
                  <li key={row.team.code}>
                    <button
                      type="button"
                      onClick={() => pick(row.team.code)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 ${
                        pickedId === row.team.code ? "bg-muted" : ""
                      }`}
                    >
                      <span
                        className={`inline-block size-1.5 shrink-0 rounded-full ${
                          row.qualifies
                            ? "bg-emerald-500"
                            : row.thirdPlace
                              ? "bg-amber-400"
                              : "bg-foreground/20"
                        }`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{row.team.name}</span>
                      <span className="shrink-0 tabular-nums text-xs text-foreground/45">
                        {row.team.elo}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Result */}
      <section>
        {analysing ? (
          <div className="rounded-xl border border-foreground/10 p-6 text-sm text-foreground/50">
            Running 5,000 tournament simulations…
          </div>
        ) : result ? (
          <ResultPanel result={result} />
        ) : (
          <div className="rounded-xl border border-dashed border-foreground/15 p-8 text-center text-sm text-foreground/50">
            Pick a nation to see their projected path to the trophy.
          </div>
        )}
      </section>
    </div>
  );
}
