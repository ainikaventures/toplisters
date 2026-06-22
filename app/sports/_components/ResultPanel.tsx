"use client";

import type { AnalysisResult } from "@/lib/sports/types";
import { ProbabilityBars } from "./ProbabilityBars";
import { RoadmapPanel } from "./RoadmapPanel";

/** The result for a picked competitor: win %, exact verdict, path, AI roadmap. */
export function ResultPanel({ result }: { result: AnalysisResult }) {
  const { target, rivals, possibility, path, sport } = result;
  const statusLabel = possibility.clinched
    ? "Clinched"
    : possibility.alive
      ? "Still possible"
      : "Eliminated";
  const dotClass = possibility.clinched
    ? "bg-emerald-500"
    : possibility.alive
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div className="space-y-8">
      {/* Big number + exact verdict */}
      <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="shrink-0">
          <div className="text-5xl font-semibold tabular-nums leading-none">
            {(target.probability * 100).toFixed(1)}
            <span className="text-2xl text-foreground/40">%</span>
          </div>
          <div className="mt-1 text-xs uppercase tracking-wide text-foreground/50">
            simulated title chance
          </div>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            possibility.alive ? "border-foreground/15" : "border-red-500/30 bg-red-500/5"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`inline-block size-2 rounded-full ${dotClass}`} aria-hidden />
            <span className="text-sm font-medium">{statusLabel}</span>
          </div>
          <p className="mt-2 text-sm text-foreground/80">{possibility.headline}</p>
        </div>
      </div>

      {/* Exact magic numbers */}
      <dl className="grid gap-3 sm:grid-cols-2">
        {possibility.facts.map((f) => (
          <div
            key={f.label}
            className="rounded-lg border border-foreground/10 bg-muted/30 px-3 py-2"
          >
            <dt className="text-xs uppercase tracking-wide text-foreground/50">{f.label}</dt>
            <dd className="mt-0.5 text-sm">{f.value}</dd>
          </div>
        ))}
      </dl>

      {/* Win probability vs the field */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">Win probability — you vs the field</h3>
        <ProbabilityBars target={target} rivals={rivals} />
        <p className="mt-2 text-xs text-foreground/45">
          Monte-Carlo simulation — a model estimate, not a guarantee.
        </p>
      </section>

      {/* Prescriptive path / scenario */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">
          {sport === "f1" ? "What has to happen" : "Path to glory"}
        </h3>
        <ol className="space-y-2">
          {path.map((step, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg border border-foreground/10 px-3 py-2"
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{step.label}</div>
                <div className="text-sm text-foreground/70">{step.detail}</div>
              </div>
              {step.probability != null && (
                <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-foreground/55">
                  {(step.probability * 100).toFixed(0)}%
                  {step.cumulative != null ? ` · cum ${(step.cumulative * 100).toFixed(0)}%` : ""}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* AI roadmap */}
      <RoadmapPanel result={result} sport={sport} />
    </div>
  );
}
