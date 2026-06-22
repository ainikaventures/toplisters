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
const MWP_SIMS = 2500; // sub-sims for a single knockout tie's win probability
const MAX_DRAW = 0.3; // draw probability when two teams are perfectly even (projection only)
const ROUND_LABELS = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"];

// ─── Poisson goal model ────────────────────────────────────────────────────
// Each match is simulated as goals ~ Poisson(λ), with λ driven by the Elo gap.
// This yields real scorelines, so GD/GF tiebreakers and ET/penalties are
// modelled properly rather than collapsing to a single win/draw/loss roll.
const BASE_GOALS = 1.35; // ~avg goals per team in an evenly-matched WC game
const GOAL_ELO_K = 0.9; // how strongly the Elo gap inflates the goal rate
const ET_SCALE = 1 / 3; // extra time ≈ 30 min of the 90
const HOST_ELO_BONUS = 60; // home advantage for the 2026 co-hosts
const HOSTS = new Set(["USA", "CAN", "MEX"]);

function adjElo(t: WcTeam): number {
  return t.elo + (HOSTS.has(t.code) ? HOST_ELO_BONUS : 0);
}

function lambdas(a: WcTeam, b: WcTeam): [number, number] {
  const diff = (adjElo(a) - adjElo(b)) / 400;
  return [BASE_GOALS * Math.exp(GOAL_ELO_K * diff), BASE_GOALS * Math.exp(-GOAL_ELO_K * diff)];
}

/** Knuth's Poisson sampler (λ small, as here). */
function poisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

/** Winner of a knockout tie: 90' + extra time + penalties. */
function knockoutWinner(a: WcTeam, b: WcTeam): WcTeam {
  const [la, lb] = lambdas(a, b);
  let ga = poisson(la);
  let gb = poisson(lb);
  if (ga === gb) {
    ga += poisson(la * ET_SCALE);
    gb += poisson(lb * ET_SCALE);
  }
  if (ga > gb) return a;
  if (gb > ga) return b;
  // Penalties — near coin-flip, slight edge to the stronger side.
  const edge = Math.min(0.65, Math.max(0.35, 0.5 + (adjElo(a) - adjElo(b)) / 4000));
  return Math.random() < edge ? a : b;
}

/** P(A advances past B) in a knockout tie, via a quick sub-Monte-Carlo. */
function matchWinProb(a: WcTeam, b: WcTeam): number {
  let w = 0;
  for (let i = 0; i < MWP_SIMS; i++) if (knockoutWinner(a, b) === a) w++;
  return w / MWP_SIMS;
}

interface Standing {
  team: WcTeam;
  pts: number;
  gd: number;
  gf: number;
}

/** Simulate (or read, if locked) a group → standings sorted pts→GD→GF→Elo. */
function simGroup(group: WcTeam[]): Standing[] {
  const st = new Map<string, Standing>(
    group.map((t) => [t.code, { team: t, pts: 0, gd: 0, gf: 0 }]),
  );
  const allLocked = group.every((t) => typeof t.result === "number");
  if (allLocked) {
    for (const t of group) {
      const s = st.get(t.code)!;
      s.pts = t.result ?? 0;
      s.gf = t.gf ?? 0;
      s.gd = (t.gf ?? 0) - (t.ga ?? 0);
    }
  } else {
    for (let i = 0; i < group.length; i++) {
      for (let k = i + 1; k < group.length; k++) {
        const A = group[i];
        const B = group[k];
        const [la, lb] = lambdas(A, B);
        const ga = poisson(la);
        const gb = poisson(lb);
        const sa = st.get(A.code)!;
        const sb = st.get(B.code)!;
        sa.gf += ga;
        sa.gd += ga - gb;
        sb.gf += gb;
        sb.gd += gb - ga;
        if (ga > gb) sa.pts += 3;
        else if (gb > ga) sb.pts += 3;
        else {
          sa.pts += 1;
          sb.pts += 1;
        }
      }
    }
  }
  return [...st.values()].sort(
    (x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || adjElo(y.team) - adjElo(x.team),
  );
}

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
    const { w, d } = outcomeProbs(adjElo(team), adjElo(opp));
    pts += 3 * w + d;
  }
  return pts;
}

function rankGroup(group: WcTeam[]): GroupRow[] {
  return group
    .map((team) => ({ team, points: expectedPoints(team, group) }))
    .sort((a, b) => b.points - a.points || adjElo(b.team) - adjElo(a.team))
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
    const p = matchWinProb(target, opp);
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

/**
 * Monte Carlo over full tournaments → title probability per team.
 *
 * Group stage uses the Poisson goal model (or real standings for completed
 * groups), ranked by the proper points→GD→GF tiebreakers; knockouts resolve
 * via 90' + extra time + penalties. Conditioned on live results where the
 * football-data overlay has locked a group.
 */
function simulate(data: WcData): ProbabilityEntry[] {
  const wins = new Map<string, number>();
  for (const t of data.teams) wins.set(t.code, 0);
  const groups = Object.values(data.groups);

  for (let s = 0; s < SIMS; s++) {
    const top: WcTeam[] = [];
    const thirds: Standing[] = [];
    for (const group of groups) {
      const ranked = simGroup(group);
      top.push(ranked[0].team, ranked[1].team);
      if (ranked[2]) thirds.push(ranked[2]);
    }
    thirds.sort(
      (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || adjElo(b.team) - adjElo(a.team),
    );
    const qualifiers = [...top, ...thirds.slice(0, 8).map((t) => t.team)];

    let alive = seedBracket(qualifiers);
    while (alive.length > 1) {
      const next: WcTeam[] = [];
      for (let i = 0; i < alive.length; i += 2) next.push(knockoutWinner(alive[i], alive[i + 1]));
      alive = next;
    }
    const champ = alive[0];
    if (champ) wins.set(champ.code, (wins.get(champ.code) ?? 0) + 1);
  }

  return data.teams
    .map((t) => ({ id: t.code, name: t.name, probability: (wins.get(t.code) ?? 0) / SIMS }))
    .sort((a, b) => b.probability - a.probability);
}
