"use client";

import { useEffect, useState } from "react";
import { f1Engine, type F1Data } from "@/lib/sports/f1/engine";
import type { AnalysisResult } from "@/lib/sports/types";
import { ResultPanel } from "./ResultPanel";

export function F1App() {
  const [data, setData] = useState<F1Data | null>(null);
  const [error, setError] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analysing, setAnalysing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    f1Engine
      .load()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function pick(id: string) {
    if (!data) return;
    setPickedId(id);
    setResult(null);
    setAnalysing(true);
    // Defer the (heavy) Monte-Carlo so the "Analysing…" state paints first.
    setTimeout(() => {
      setResult(f1Engine.analyse(data, id));
      setAnalysing(false);
    }, 20);
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-foreground/70">
        Couldn&apos;t load live F1 standings right now. Please try again shortly.
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-foreground/10 p-6 text-sm text-foreground/50">
        Loading live standings…
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,360px)_1fr]">
      {/* Standings */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">
            {data.season} standings · round {data.lastRound}
          </h2>
          <span className="text-xs text-foreground/50">
            {data.remainingRaces}r / {data.remainingSprints}s left
          </span>
        </div>
        <ul className="overflow-hidden rounded-xl border border-foreground/10">
          {data.drivers.map((d, i) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => pick(d.id)}
                className={`flex w-full items-center gap-3 border-foreground/5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${
                  i > 0 ? "border-t" : ""
                } ${pickedId === d.id ? "bg-muted" : ""}`}
              >
                <span className="w-5 shrink-0 text-right tabular-nums text-foreground/50">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{d.name}</span>
                  <span className="block truncate text-xs text-foreground/50">{d.constructor}</span>
                </span>
                <span className="shrink-0 tabular-nums font-semibold">{d.points}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Result */}
      <section>
        {analysing ? (
          <div className="rounded-xl border border-foreground/10 p-6 text-sm text-foreground/50">
            Running 8,000 simulations…
          </div>
        ) : result ? (
          <ResultPanel result={result} />
        ) : (
          <div className="rounded-xl border border-dashed border-foreground/15 p-8 text-center text-sm text-foreground/50">
            Pick a driver to see if they can still win the title.
          </div>
        )}
      </section>
    </div>
  );
}
