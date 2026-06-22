"use client";

import { useMemo, useState } from "react";
import { worldCupEngine, groupTables, buildWcData } from "@/lib/sports/worldcup/engine";
import type { WcTeam } from "@/lib/sports/worldcup/teams";
import type { AnalysisResult } from "@/lib/sports/types";
import { ResultPanel } from "./ResultPanel";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

function Flag({ iso2 }: { iso2: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${iso2}.png`}
      srcSet={`https://flagcdn.com/w80/${iso2}.png 2x`}
      alt=""
      width={22}
      height={16}
      loading="lazy"
      className="h-4 w-[22px] shrink-0 rounded-[2px] object-cover ring-1 ring-foreground/10"
    />
  );
}

interface StatRow {
  team: WcTeam;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
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
      return {
        team,
        p: team.played ?? w + d + l,
        w,
        d,
        l,
        gf,
        ga,
        gd: gf - ga,
        pts: team.result ?? w * 3 + d,
      };
    })
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.team.elo - a.team.elo)
    .map((r, i) => ({ ...r, qualifies: i < 2, third: i === 2 }));
}

function dot(qualifies: boolean, third: boolean) {
  return qualifies ? "bg-emerald-500" : third ? "bg-amber-400" : "bg-foreground/20";
}

export function WorldCupApp({ teams: allTeams }: { teams: WcTeam[] }) {
  const [group, setGroup] = useState("A");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analysing, setAnalysing] = useState(false);

  const data = useMemo(() => buildWcData(allTeams), [allTeams]);
  const tables = useMemo(() => groupTables(data), [data]);

  function pick(code: string) {
    setPickedId(code);
    setResult(null);
    setAnalysing(true);
    setTimeout(() => {
      setResult(worldCupEngine.analyse(data, code));
      setAnalysing(false);
    }, 20);
  }

  const teams = data.groups[group] ?? [];
  const stats = statRows(teams);
  const projection = tables[group] ?? [];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,460px)_1fr]">
      {/* Left: group selector + the active group's table */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Pick a nation</h2>
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

        {/* Group tabs A–L */}
        <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
          {GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={`size-8 shrink-0 rounded-md text-xs font-semibold transition-colors ${
                g === group
                  ? "bg-foreground text-background"
                  : "border border-foreground/15 text-foreground/60 hover:border-foreground/40"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-foreground/10">
          {/* Header row */}
          <div className="flex items-center gap-2 border-b border-foreground/10 bg-muted/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground/50">
            <span className="w-4 shrink-0" />
            <span className="flex-1">Group {group}</span>
            {stats ? (
              <span className="flex shrink-0 gap-2 tabular-nums">
                <span className="w-5 text-right">P</span>
                <span className="w-5 text-right">W</span>
                <span className="w-5 text-right">D</span>
                <span className="w-5 text-right">L</span>
                <span className="w-8 text-right">GD</span>
                <span className="w-6 text-right">Pts</span>
              </span>
            ) : (
              <span className="flex shrink-0 gap-3">
                <span className="w-10 text-right">Elo</span>
                <span className="w-14 text-right">Proj pts</span>
              </span>
            )}
          </div>

          <ul>
            {stats
              ? stats.map((r) => (
                  <Row
                    key={r.team.code}
                    team={r.team}
                    picked={pickedId === r.team.code}
                    qualifies={r.qualifies}
                    third={r.third}
                    onPick={pick}
                  >
                    <span className="flex shrink-0 gap-2 tabular-nums text-foreground/70">
                      <span className="w-5 text-right">{r.p}</span>
                      <span className="w-5 text-right">{r.w}</span>
                      <span className="w-5 text-right">{r.d}</span>
                      <span className="w-5 text-right">{r.l}</span>
                      <span className="w-8 text-right">{r.gd > 0 ? `+${r.gd}` : r.gd}</span>
                      <span className="w-6 text-right font-semibold text-foreground">{r.pts}</span>
                    </span>
                  </Row>
                ))
              : projection.map((r) => (
                  <Row
                    key={r.team.code}
                    team={r.team}
                    picked={pickedId === r.team.code}
                    qualifies={r.qualifies}
                    third={r.thirdPlace}
                    onPick={pick}
                  >
                    <span className="flex shrink-0 gap-3 tabular-nums">
                      <span className="w-10 text-right text-foreground/45">{r.team.elo}</span>
                      <span className="w-14 text-right font-semibold">{r.points.toFixed(1)}</span>
                    </span>
                  </Row>
                ))}
          </ul>
        </div>
        <p className="mt-2 text-xs text-foreground/45">
          {stats
            ? "Live group standings."
            : "Elo = team strength rating · Proj pts = model-projected group points. Real P/W/D/L/GF/GA appear once results are entered."}
        </p>
      </section>

      {/* Right: analysis */}
      <section>
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
  );
}

function Row({
  team,
  picked,
  qualifies,
  third,
  onPick,
  children,
}: {
  team: WcTeam;
  picked: boolean;
  qualifies: boolean;
  third: boolean;
  onPick: (code: string) => void;
  children: React.ReactNode;
}) {
  return (
    <li className="border-t border-foreground/5 first:border-t-0">
      <button
        type="button"
        onClick={() => onPick(team.code)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${
          picked ? "bg-muted" : ""
        }`}
      >
        <span className={`inline-block size-1.5 shrink-0 rounded-full ${dot(qualifies, third)}`} />
        <Flag iso2={team.iso2} />
        <span className="min-w-0 flex-1 truncate">{team.name}</span>
        {children}
      </button>
    </li>
  );
}
