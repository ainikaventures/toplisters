import type { Metadata } from "next";
import Link from "next/link";
import { sportsSocial } from "@/lib/seo/og";
import { fetchWcStandings, applyStandings } from "@/lib/sports/worldcup/standings";
import { WC_TEAMS } from "@/lib/sports/worldcup/teams";

export const metadata: Metadata = {
  title: "Sports — championships, mapped to the finish",
  description:
    "Pick who you want to win, get the exact 'is it still mathematically possible' verdict, a Monte-Carlo win probability, and an AI roadmap of how they get there. Formula 1 + FIFA World Cup 2026.",
  ...sportsSocial({
    title: "Toplisters Sports — championships, mapped to the finish",
    description:
      "Win probabilities, exact possibility maths, and prescriptive AI roadmaps for F1 and the World Cup.",
    url: "/sports",
  }),
};

// Refresh the live WC status banner periodically.
export const revalidate = 120;

const SPORTS = [
  {
    href: "/f1",
    kicker: "Live standings",
    title: "Formula 1",
    blurb:
      "Pick a driver. See if they can still catch the leader, the exact magic numbers, their simulated title odds, and what has to happen.",
  },
  {
    href: "/world-cup",
    kicker: "Knockout bracket",
    title: "FIFA World Cup 2026",
    blurb:
      "Pick a nation. Get their projected path to the final, per-round odds, title probability, and the roadmap to glory.",
  },
];

async function wcLiveStatus(): Promise<string | null> {
  const teams = applyStandings(WC_TEAMS, await fetchWcStandings());
  const maxPlayed = Math.max(0, ...teams.map((t) => t.played ?? 0));
  if (maxPlayed === 0) return null;
  return teams.every((t) => (t.played ?? 0) >= 3) ? "Knockouts underway" : "Group stage underway";
}

export default async function SportsLanding() {
  const wcStatus = await wcLiveStatus();
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16">
      {wcStatus ? (
        <Link
          href="/world-cup"
          className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm transition-colors hover:border-emerald-500/50"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
          <span className="font-medium">World Cup 2026 — {wcStatus}</span>
          <span className="text-foreground/60">See the bracket &amp; live standings →</span>
        </Link>
      ) : null}
      <header className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-widest text-foreground/50">
          Toplisters Sports
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          Championships, mapped to the finish.
        </h1>
        <p className="mt-4 text-base text-foreground/70">
          Choose who you want to win. We give you the <strong>exact</strong> verdict on whether
          it&apos;s still mathematically possible, a Monte-Carlo win probability, and an
          AI-generated roadmap of precisely how they get there.
        </p>
      </header>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {SPORTS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex flex-col rounded-2xl border border-foreground/10 bg-muted/20 p-6 transition-colors hover:border-foreground/30"
          >
            <span className="text-xs font-medium uppercase tracking-widest text-foreground/40">
              {s.kicker}
            </span>
            <span className="mt-2 text-2xl font-semibold tracking-tight">{s.title}</span>
            <span className="mt-3 text-sm text-foreground/60">{s.blurb}</span>
            <span className="mt-6 text-sm font-medium text-foreground/80 group-hover:underline">
              Analyse →
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-xs text-foreground/40">
        Win % is a model/simulation. The &ldquo;mathematically possible&rdquo; verdict is exact.
      </p>
    </div>
  );
}
