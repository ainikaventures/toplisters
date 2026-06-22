import type {
  AnalysisResult,
  Competitor,
  PathStep,
  PossibilityVerdict,
  ProbabilityEntry,
  SportEngine,
} from "../types";
import { WC_TEAMS, type WcTeam } from "./teams";

/**
 * FIFA World Cup 2026 engine — Elo-driven, knockout-first (the live phase
 * once the group stage ends). Group stage is a round-robin resolved from Elo
 * (or locked `result` points); top-2 per group + 8 best thirds → 32; a
 * standard Elo-seeded single-elim bracket decides the champion.
 *
 * (a) Win probability = Monte Carlo over full tournaments. (b) "Path to
 * glory" = a deterministic projected bracket with per-round odds.
 */

const SIMS = 5000;
const MAX_DRAW = 0.3; // draw probability when two teams are perfectly even
const ROUND_LABELS = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"];

export interface WcData {
  teams: WcTeam[];
  groups: Record<string, WcTeam[]>;
}

/** Group the (possibly live-overlaid) teams into the WcData the engine uses. */
export function buildWcData(teams: WcTeam[]): WcData {
  const groups: Record<string, WcTeam[]> = {};
  for (const t of teams) (groups[t.group] ??= []).push(t);
  return { teams, groups };
}

export interface GroupRow {
  team: WcTeam;
  points: number;
  qualifies: boolean;
  thirdPlace: boolean;
}

/** P(A beats B) in a single match, draws excluded. */
export function expected(elA: number, elB: number): number {
  return 1 / (1 + 10 ** ((elB - elA) / 400));
}

/** W/D/L probabilities for A vs B — draws likelier when teams are close. */
function outcomeProbs(elA: number, elB: number): { w: number; d: number; l: number } {
  const e = expected(elA, elB);
  const draw = MAX_DRAW * (1 - Math.abs(2 * e - 1));
  return { w: (1 - draw) * e, d: draw, l: (1 - draw) * (1 - e) };
}

/** Deterministic expected group points for a team (or its locked result). */
function expectedPoints(team: WcTeam, group: WcTeam[]): number {
  if (typeof team.result === "number") return team.result;
  let pts = 0;
  for (const opp of group) {
    if (opp.code === team.code) continue;
    const { w, d } = outcomeProbs(team.elo, opp.elo);
    pts += 3 * w + d;
  }
  return pts;
}

function rankGroup(group: WcTeam[]): GroupRow[] {
  return group
    .map((team) => ({ team, points: expectedPoints(team, group) }))
    .sort((a, b) => b.points - a.points || b.team.elo - a.team.elo)
    .map((row, i) => ({ ...row, qualifies: i < 2, thirdPlace: i === 2 }));
}

/** Deterministic 32 qualifiers: top-2 per group + 8 best thirds (pts, Elo). */
function deterministicQualifiers(data: WcData): WcTeam[] {
  const top: WcTeam[] = [];
  const thirds: { team: WcTeam; points: number }[] = [];
  for (const group of Object.values(data.groups)) {
    const rows = rankGroup(group);
    top.push(rows[0].team, rows[1].team);
    if (rows[2]) thirds.push({ team: rows[2].team, points: rows[2].points });
  }
  thirds.sort((a, b) => b.points - a.points || b.team.elo - a.team.elo);
  return [...top, ...thirds.slice(0, 8).map((t) => t.team)];
}

/** Standard single-elim seed-slot order for `n` (power of two). */
function bracketOrder(n: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < n) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) next.push(s, sum - s);
    seeds = next;
  }
  return seeds;
}

/** Place qualifiers (Elo-seeded) into bracket slots. slot[j] = a team. */
function seedBracket(qualifiers: WcTeam[]): WcTeam[] {
  const bySeed = [...qualifiers].sort((a, b) => b.elo - a.elo); // seed 1 = strongest
  const order = bracketOrder(qualifiers.length);
  const slots: WcTeam[] = new Array(qualifiers.length);
  for (let j = 0; j < order.length; j++) slots[j] = bySeed[order[j] - 1];
  return slots;
}

export const worldCupEngine: SportEngine<WcData> = {
  sport: "world-cup",

  async load(): Promise<WcData> {
    return buildWcData(WC_TEAMS);
  },

  competitors(data: WcData): Competitor[] {
    return [...data.teams]
      .sort((a, b) => b.elo - a.elo)
      .map((t) => ({ id: t.code, name: t.name, subtitle: `Group ${t.group}`, rating: t.elo }));
  },

  analyse(data: WcData, targetId: string): AnalysisResult {
    const target = data.teams.find((t) => t.code === targetId) ?? data.teams[0];
    const probabilities = simulate(data);
    const targetProb = probabilities.find((p) => p.id === target.code) ?? {
      id: target.code,
      name: target.name,
      probability: 0,
    };
    const rivals = probabilities.filter((p) => p.id !== target.code).slice(0, 3);

    const qualifiers = deterministicQualifiers(data);
    const qualifies = qualifiers.some((t) => t.code === target.code);
    const { possibility, path } = projectPath(data, target, qualifiers, qualifies);

    return {
      sport: "world-cup",
      target: targetProb,
      rivals,
      possibility,
      path,
      meta: {
        group: target.group,
        elo: target.elo,
        qualifiers: qualifiers.length,
        phase: "knockout",
      },
    };
  },
};

/** Per-group rows for the standings view (projected qualifiers marked). */
export function groupTables(data: WcData): Record<string, GroupRow[]> {
  const out: Record<string, GroupRow[]> = {};
  for (const [g, teams] of Object.entries(data.groups)) out[g] = rankGroup(teams);
  return out;
}

function projectPath(
  data: WcData,
  target: WcTeam,
  qualifiers: WcTeam[],
  qualifies: boolean,
): { possibility: PossibilityVerdict; path: PathStep[] } {
  const group = data.groups[target.group] ?? [];
  const rows = rankGroup(group);
  const groupPos = rows.findIndex((r) => r.team.code === target.code) + 1;

  if (!qualifies) {
    return {
      possibility: {
        alive: false,
        clinched: false,
        headline: `${target.name} is projected to miss the knockouts (${ordinal(groupPos)} in Group ${target.group}).`,
        facts: [
          { label: "Projected group finish", value: `${ordinal(groupPos)} of 4` },
          { label: "Knockout route", value: "must finish top-2, or among the 8 best third-placed teams" },
        ],
      },
      path: [
        { label: "Survive the group", detail: `Climb to top-2 in Group ${target.group} (or a best-third spot) to reach the Round of 32.` },
      ],
    };
  }

  // Walk the deterministic bracket, projecting the toughest likely opponent.
  const slots = seedBracket(qualifiers);
  const j = slots.findIndex((t) => t.code === target.code);
  const path: PathStep[] = [];
  let cumulative = 1;
  for (let r = 0; r < ROUND_LABELS.length; r++) {
    const blockSize = 2 ** r;
    const parentStart = Math.floor(j / (blockSize * 2)) * (blockSize * 2);
    const inLeft = Math.floor(j / blockSize) % 2 === 0;
    const sibStart = inLeft ? parentStart + blockSize : parentStart;
    const siblings = slots.slice(sibStart, sibStart + blockSize).filter(Boolean);
    if (siblings.length === 0) break;
    const opp = siblings.reduce((a, b) => (b.elo > a.elo ? b : a));
    const p = expected(target.elo, opp.elo);
    cumulative *= p;
    path.push({
      label: ROUND_LABELS[r],
      detail: `Likely opponent: ${opp.name} (Elo ${opp.elo})`,
      probability: p,
      cumulative,
    });
  }

  const titleP = cumulative;
  return {
    possibility: {
      alive: true,
      clinched: false,
      headline: `${target.name} projects to qualify ${ordinal(groupPos)} in Group ${target.group} — a ${ROUND_LABELS.length}-round path to the trophy.`,
      facts: [
        { label: "Projected group finish", value: `${ordinal(groupPos)} of 4` },
        { label: "Knockout rounds to win", value: `${path.length}` },
        { label: "Projected toughest test", value: toughest(path) },
        { label: "Path-implied title odds", value: `${(titleP * 100).toFixed(1)}%` },
      ],
    },
    path,
  };
}

function toughest(path: PathStep[]): string {
  if (path.length === 0) return "—";
  const hardest = path.reduce((a, b) => ((b.probability ?? 1) < (a.probability ?? 1) ? b : a));
  return `${hardest.label} — ${(((hardest.probability ?? 0) * 100) | 0)}% to advance`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** Monte Carlo over full tournaments → title probability per team. */
function simulate(data: WcData): ProbabilityEntry[] {
  const wins = new Map<string, number>();
  for (const t of data.teams) wins.set(t.code, 0);
  const groups = Object.values(data.groups);

  for (let s = 0; s < SIMS; s++) {
    // Group stage → 32 qualifiers.
    const top: WcTeam[] = [];
    const thirds: { team: WcTeam; pts: number }[] = [];
    for (const group of groups) {
      const pts = new Map<string, number>(group.map((t) => [t.code, 0]));
      for (let a = 0; a < group.length; a++) {
        for (let b = a + 1; b < group.length; b++) {
          const ta = group[a];
          const tb = group[b];
          if (typeof ta.result === "number" && typeof tb.result === "number") continue;
          const { w, d } = outcomeProbs(ta.elo, tb.elo);
          const roll = Math.random();
          if (roll < w) pts.set(ta.code, (pts.get(ta.code) ?? 0) + 3);
          else if (roll < w + d) {
            pts.set(ta.code, (pts.get(ta.code) ?? 0) + 1);
            pts.set(tb.code, (pts.get(tb.code) ?? 0) + 1);
          } else pts.set(tb.code, (pts.get(tb.code) ?? 0) + 3);
        }
      }
      const ranked = [...group].sort((x, y) => {
        const px = typeof x.result === "number" ? x.result : pts.get(x.code) ?? 0;
        const py = typeof y.result === "number" ? y.result : pts.get(y.code) ?? 0;
        return py - px || y.elo - x.elo;
      });
      top.push(ranked[0], ranked[1]);
      if (ranked[2]) thirds.push({ team: ranked[2], pts: pts.get(ranked[2].code) ?? 0 });
    }
    thirds.sort((a, b) => b.pts - a.pts || b.team.elo - a.team.elo);
    const qualifiers = [...top, ...thirds.slice(0, 8).map((t) => t.team)];

    // Knockout: Elo-seeded single-elim.
    let alive = seedBracket(qualifiers);
    while (alive.length > 1) {
      const next: WcTeam[] = [];
      for (let i = 0; i < alive.length; i += 2) {
        const a = alive[i];
        const b = alive[i + 1];
        next.push(Math.random() < expected(a.elo, b.elo) ? a : b);
      }
      alive = next;
    }
    const champ = alive[0];
    if (champ) wins.set(champ.code, (wins.get(champ.code) ?? 0) + 1);
  }

  return data.teams
    .map((t) => ({ id: t.code, name: t.name, probability: (wins.get(t.code) ?? 0) / SIMS }))
    .sort((a, b) => b.probability - a.probability);
}
