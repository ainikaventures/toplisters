"use client";

import { useState } from "react";
import type { AnalysisResult, SportId } from "@/lib/sports/types";

type State = "idle" | "loading" | "done" | "unavailable";

/**
 * The headline AI layer. Posts the computed analysis to /api/sports/roadmap
 * (which hides the LLM key server-side) and renders the prescriptive steps +
 * pundit line. Degrades gracefully — the maths/odds above stand on their own.
 */
export function RoadmapPanel({ result, sport }: { result: AnalysisResult; sport: SportId }) {
  const [state, setState] = useState<State>("idle");
  const [data, setData] = useState<{ roadmap: string[]; pundit: string } | null>(null);

  async function generate() {
    setState("loading");
    try {
      const res = await fetch("/api/sports/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, targetName: result.target.name, analysis: result }),
      });
      if (!res.ok) {
        setState("unavailable");
        return;
      }
      const json = (await res.json()) as { roadmap: string[]; pundit: string };
      setData(json);
      setState("done");
    } catch {
      setState("unavailable");
    }
  }

  return (
    <section className="rounded-xl border border-foreground/10 bg-muted/20 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">AI roadmap</h3>
        {state === "idle" && (
          <button
            type="button"
            onClick={generate}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            Generate the plan
          </button>
        )}
        {state === "loading" && <span className="text-xs text-foreground/50">Thinking…</span>}
        {state === "done" && (
          <button
            type="button"
            onClick={generate}
            className="text-xs text-foreground/50 hover:text-foreground"
          >
            Regenerate
          </button>
        )}
      </div>

      {state === "idle" && (
        <p className="mt-2 text-sm text-foreground/55">
          Turn the numbers into a concrete, prescriptive plan — who to beat, what must happen.
        </p>
      )}
      {state === "unavailable" && (
        <p className="mt-3 text-sm text-foreground/60">
          The AI roadmap is unavailable right now — the verdict and odds above still tell the
          story.
        </p>
      )}
      {state === "done" && data && (
        <div className="mt-3 space-y-3">
          <ol className="space-y-1.5">
            {data.roadmap.map((step, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-foreground/40">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {data.pundit && (
            <blockquote className="border-l-2 border-[color:var(--tl-blue,#1F6FEB)] pl-3 text-sm italic text-foreground/80">
              {data.pundit}
            </blockquote>
          )}
        </div>
      )}
    </section>
  );
}
