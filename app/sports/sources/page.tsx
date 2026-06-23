import type { Metadata } from "next";
import { sportsSocial } from "@/lib/seo/og";

export const metadata: Metadata = {
  title: "Data sources",
  description:
    "The data behind Toplisters Sports — live feeds and models per sport, with attribution. F1 standings come live from Jolpica-F1; the World Cup uses an Elo model with an optional live results feed.",
  ...sportsSocial({
    title: "Sports data sources · Toplisters",
    description: "Live feeds and models behind each sport, with attribution.",
    url: "/sports/sources",
  }),
};

type Status = "live" | "model" | "planned";

interface SourceRow {
  sport: string;
  source: string;
  url: string;
  provides: string;
  kind: string;
  status: Status;
}

const SOURCES: SourceRow[] = [
  {
    sport: "Formula 1",
    source: "Jolpica-F1 (Ergast successor)",
    url: "https://jolpi.ca",
    provides:
      "Live driver standings (points, wins) and the race + sprint schedule. Powers the exact possibility maths and the win-probability simulation.",
    kind: "Free public API · keyless · live",
    status: "live",
  },
  {
    sport: "FIFA World Cup 2026",
    source: "World-Football-Elo dataset (curated)",
    url: "https://www.eloratings.net",
    provides:
      "48 teams, group draw, and Elo strength ratings — seeds the bracket model, the projected group points, and the Monte-Carlo title odds.",
    kind: "Editable dataset · model projection",
    status: "model",
  },
  {
    sport: "FIFA World Cup 2026",
    source: "Live results feed (football-data.org / ESPN)",
    url: "https://www.football-data.org",
    provides:
      "When configured, overlays the real group standings — points, played, W/D/L, goals — and knockout results onto the model. Falls back to the Elo projection when unavailable.",
    kind: "Official free API (token) / keyless feed",
    status: "planned",
  },
];

const STATUS_LABEL: Record<Status, string> = {
  live: "Live",
  model: "Model",
  planned: "Optional / planned",
};
const STATUS_DOT: Record<Status, string> = {
  live: "bg-emerald-500",
  model: "bg-amber-400",
  planned: "bg-foreground/30",
};

export default function SportsSourcesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Data sources</h1>
        <p className="mt-3 text-sm text-foreground/70">
          Each sport draws from a live feed where one exists, and a transparent model where it
          doesn&apos;t. We use official or open data, credit every source, and never present a model
          estimate as a result — the &ldquo;mathematically possible&rdquo; verdict is exact, the win
          % is a simulation.
        </p>
      </header>

      <ul className="space-y-3">
        {SOURCES.map((s, i) => (
          <li
            key={i}
            className="rounded-xl border border-foreground/10 p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-foreground/45">
                  {s.sport}
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-foreground/55">
                <span className={`inline-block size-2 rounded-full ${STATUS_DOT[s.status]}`} />
                {STATUS_LABEL[s.status]}
              </span>
            </div>
            <a
              href={s.url}
              target="_blank"
              rel="noopener nofollow"
              className="mt-1 inline-block text-base font-semibold hover:underline"
            >
              {s.source}
            </a>
            <p className="mt-1 text-sm text-foreground/70">{s.provides}</p>
            <p className="mt-2 text-xs text-foreground/45">{s.kind}</p>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs text-foreground/45">
        F1 data via the Jolpica-F1 API (an Ergast successor). World Cup Elo ratings derived from
        World Football Elo Ratings. Win probabilities are model simulations, not betting odds.
      </p>
    </div>
  );
}
