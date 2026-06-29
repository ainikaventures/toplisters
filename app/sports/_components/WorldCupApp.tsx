"use client";

import { useEffect, useMemo, useState } from "react";
import { worldCupEngine, groupTables, buildWcData, projectedBracket } from "@/lib/sports/worldcup/engine";
import type { GroupRow } from "@/lib/sports/worldcup/engine";
import type { WcTeam } from "@/lib/sports/worldcup/teams";
import type { AnalysisResult } from "@/lib/sports/types";
import { ResultPanel } from "./ResultPanel";
import { Bracket } from "./Bracket";
import { Flag } from "./Flag";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

interface StatRow {
  team: WcTeam;
  p: number;
  w: number;
  d: number;
  l: number;
  gd: number;
  pts: number;
  qualifies: boolean;
  third: boolean;
}

/** Real group table once games are played, else null (use the projection). */
function statRows(teams: WcTeam[]): StatRow[] | null {
  if (!teams.some((t) => (t.played ?? 0) > 0)) return null;
  return teams
    .map((team) => {
      const w = team.won ?? 0;
      const d = team.drawn ?? 0;
      const l = team.lost ?? 0;
      const gf = team.gf ?? 0;
      const ga = team.ga ?? 0;
      return { team, p: team.played ?? w + d + l, w, d, l, gd: gf - ga, pts: team.result ?? w * 3 + d };
    })
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.team.elo - a.team.elo)
    .map((r, i) => ({ ...r, qualifies: i < 2, third: i === 2 }));
}

function dotClass(qualifies: boolean, third: boolean) {
  return qualifies ? "bg-emerald-500" : third ? "bg-amber-400" : "bg-foreground/20";
}

/** Tournament-wide state from the live team data. */
function tournamentStatus(teams: WcTeam[]) {
  const maxPlayed = Math.max(0, ...teams.map((t) => t.played ?? 0));
  const matchesPlayed = Math.round(teams.reduce((s, t) => s + (t.played ?? 0), 0) / 2);
  const groupComplete = teams.length > 0 && teams.every((t) => (t.played ?? 0) >= 3);
  const TOTAL_GROUP_MATCHES = 72; // 12 groups × 6
  const stage =
    maxPlayed === 0
      ? "Group stage kicks off soon"
      : groupComplete
        ? "Group stage complete — into the knockouts"
        : "Group stage in progress";
  const live = maxPlayed > 0;
  return { stage, live, groupComplete, matchesPlayed, total: TOTAL_GROUP_MATCHES };
}

/** "just now" / "3m ago" for the last-updated label. */
function agoLabel(updatedAt: number | null, now: number): string {
  if (updatedAt == null) return "live";
  const mins = Math.floor((now - updatedAt) / 60000);
  if (mins <= 0) return "updated just now";
  return `updated ${mins}m ago`;
}

export function WorldCupApp({ teams: initialTeams }: { teams: WcTeam[] }) {
  const [allTeams, setAllTeams] = useState<WcTeam[]>(initialTeams);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  // Poll live standings every 90s so the table + bracket stay current without a
  // reload; tick `now` every 30s to keep the "updated Xm ago" label fresh.
  useEffect(() => {
    setUpdatedAt(Date.now());
    setNow(Date.now());
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/sports/wc-standings");
        if (!res.ok) return;
        const data = (await res.json()) as { teams?: WcTeam[] };
        if (!cancelled && Array.isArray(data.teams) && data.teams.length) {
          setAllTeams(data.teams);
          setUpdatedAt(Date.now());
        }
      } catch {
        /* keep the last good data */
      }
    }
    const poll = setInterval(refresh, 90_000);
    const ticker = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(ticker);
    };
  }, []);

  const data = useMemo(() => buildWcData(allTeams), [allTeams]);
  const tables = useMemo(() => groupTables(data), [data]);
  const status = useMemo(() => tournamentStatus(allTeams), [allTeams]);
  const bracket = useMemo(() => projectedBracket(data), [data]);

  function pick(code: string) {
    setPickedId(code);
    setResult(null);
    setAnalysing(true);
    setTimeout(() => {
      setResult(worldCupEngine.analyse(data, code));
      setAnalysing(false);
    }, 20);
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Where the tournament stands now */}
      <section className="rounded-xl border border-foreground/10 bg-muted/30 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              {status.live ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  <span className="inline-block size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Live
                </span>
              ) : null}
              <h2 className="text-lg font-semibold tracking-tight">{status.stage}</h2>
            </div>
            <p className="mt-1 text-xs text-foreground/55">
              USA · Canada · Mexico · 11 Jun – 19 Jul 2026
              {status.live && !status.groupComplete
                ? ` · ${status.matchesPlayed}/${status.total} group matches played`
                : ""}
              {status.live ? ` · ${agoLabel(updatedAt, now)}` : ""}
            </p>
          </div>
          <span className="text-xs text-foreground/50">
            <span className="mr-2">
              <span className="mr-1 inline-block size-1.5 rounded-full bg-emerald-500 align-middle" />
              qualify
            </span>
            <span>
              <span className="mr-1 inline-block size-1.5 rounded-full bg-amber-400 align-middle" />
              best-3rd
            </span>
          </span>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1fr_minmax(0,400px)]">
        {/* All 12 groups — the current standings, every team clickable */}
        <section>
          <h3 className="mb-3 text-sm font-semibold">
            {status.live ? "Group standings" : "Groups"} — tap a nation for their path to the trophy
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {GROUPS.map((g) => (
              <GroupCard
                key={g}
                group={g}
                teams={data.groups[g] ?? []}
                projection={tables[g] ?? []}
                pickedId={pickedId}
                onPick={pick}
              />
            ))}
          </div>
        </section>

        {/* Analysis — sticky alongside on wide screens */}
        <section className="xl:sticky xl:top-6 xl:self-start">
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

      <Bracket rounds={bracket} />
    </div>
  );
}

function GroupCard({
  group,
  teams,
  projection,
  pickedId,
  onPick,
}: {
  group: string;
  teams: WcTeam[];
  projection: GroupRow[];
  pickedId: string | null;
  onPick: (code: string) => void;
}) {
  const stats = statRows(teams);
  const rows = stats
    ? stats.map((r) => ({ team: r.team, qualifies: r.qualifies, third: r.third, value: String(r.pts) }))
    : projection.map((r) => ({
        team: r.team,
        qualifies: r.qualifies,
        third: r.thirdPlace,
        value: r.points.toFixed(1),
      }));

  return (
    <div className="overflow-hidden rounded-xl border border-foreground/10">
      <div className="flex items-center justify-between border-b border-foreground/10 bg-muted/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground/50">
        <span>Group {group}</span>
        <span>{stats ? "Pts" : "Proj"}</span>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.team.code} className="border-t border-foreground/5 first:border-t-0">
            <button
              type="button"
              onClick={() => onPick(r.team.code)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 ${
                pickedId === r.team.code ? "bg-muted" : ""
              }`}
            >
              <span className={`inline-block size-1.5 shrink-0 rounded-full ${dotClass(r.qualifies, r.third)}`} />
              <Flag iso2={r.team.iso2} />
              <span className="min-w-0 flex-1 truncate">{r.team.name}</span>
              <span className="shrink-0 tabular-nums font-semibold text-foreground/80">{r.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
