import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/seo/og";
import { F1App } from "../_components/F1App";

export const metadata: Metadata = {
  title: "Formula 1 — can your driver still win the title?",
  description:
    "Live F1 driver standings. Pick a driver: see if they're still mathematically alive, the exact magic numbers, their simulated championship odds, and the roadmap to the title.",
  alternates: { canonical: "/sports/f1" },
  openGraph: pageOpenGraph({
    title: "F1 title chances — Toplisters Sports",
    description: "Live standings, exact possibility maths, win probability, and an AI roadmap.",
    url: "/sports/f1",
  }),
};

export default function F1Page() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Formula 1 title chances</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Live standings from Jolpica-F1. Pick a driver to see whether they can still win.
        </p>
      </header>
      <F1App />
    </div>
  );
}
