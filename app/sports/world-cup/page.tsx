import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/seo/og";
import { WC_TEAMS } from "@/lib/sports/worldcup/teams";
import { fetchWcStandings, applyStandings } from "@/lib/sports/worldcup/standings";
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

// Live standings overlay (football-data.org) refreshed every 2 min; the page
// statically falls back to the Elo projection when no feed/key is configured.
export const revalidate = 120;

export default async function WorldCupPage() {
  const overlay = await fetchWcStandings();
  const teams = applyStandings(WC_TEAMS, overlay);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">World Cup 2026 title chances</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Elo-based knockout model{overlay ? ", overlaid with live group standings" : ""}. Pick a
          nation to see their projected path to the trophy.
        </p>
      </header>
      <WorldCupApp teams={teams} />
    </div>
  );
}
