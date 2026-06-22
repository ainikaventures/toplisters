import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/seo/og";
import { WorldCupApp } from "../_components/WorldCupApp";

export const metadata: Metadata = {
  title: "World Cup 2026 — can your team win it?",
  description:
    "FIFA World Cup 2026 win-path tool. Pick a nation: see their projected knockout bracket, per-round odds, simulated title probability, and the roadmap to the final.",
  alternates: { canonical: "/sports/world-cup" },
  openGraph: pageOpenGraph({
    title: "World Cup 2026 title chances — Toplisters Sports",
    description: "Projected bracket path, per-round odds, win probability, and an AI roadmap.",
    url: "/sports/world-cup",
  }),
};

export default function WorldCupPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">World Cup 2026 title chances</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Elo-based knockout model. Pick a nation to see their projected path to the trophy.
        </p>
      </header>
      <WorldCupApp />
    </div>
  );
}
