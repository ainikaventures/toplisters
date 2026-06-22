import type { Metadata } from "next";
import Link from "next/link";
import { pageOpenGraph } from "@/lib/seo/og";

export const metadata: Metadata = {
  title: "Sports — championships, mapped to the finish",
  description:
    "Pick who you want to win, get the exact 'is it still mathematically possible' verdict, a Monte-Carlo win probability, and an AI roadmap of how they get there. Formula 1 + FIFA World Cup 2026.",
  alternates: { canonical: "/sports" },
  openGraph: pageOpenGraph({
    title: "Toplisters Sports — championships, mapped to the finish",
    description:
      "Win probabilities, exact possibility maths, and prescriptive AI roadmaps for F1 and the World Cup.",
    url: "/sports",
  }),
};

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

export default function SportsLanding() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16">
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
