import type {
  AnalysisResult,
  Competitor,
  PossibilityVerdict,
  ProbabilityEntry,
  SportEngine,
} from "../types";
import {
  RACE_WIN_POINTS,
  maxRemaining,
  racePoints,
  sprintPoints,
} from "./points";

/**
 * Formula 1 engine — the clean core. Live data from Jolpica-F1 (the free
 * Ergast successor); keyless, fetched client-side.
 *
 * (a) Possibility = deterministic + exact. (b) Win probability = a
 * Plackett–Luce Monte Carlo. The headline is the prescriptive verdict, not
 * the odds.
 */

const BASE = "https://api.jolpi.ca/ergast/f1";
// Points-per-race that equals one Gumbel unit of race-to-race noise. Higher
// ⇒ smaller effective skill gaps ⇒ more upsets/parity. Calibrated so a clear
// points leader is favoured without the title looking decided mid-season.
// Overridable for tuning via F1_NOISE_SCALE.
const NOISE_SCALE = Number.parseFloat(process.env.F1_NOISE_SCALE ?? "") || 16;
// Regression-to-the-mean on form: early-season points-per-race is a small
// sample, so shrink each driver's strength toward the field mean. Lower ⇒
// more parity. 0..1.
const FORM_SHRINK = Number.parseFloat(process.env.F1_FORM_SHRINK ?? "") || 0.6;
const SIMS = 8000;

export interface F1Driver {
  id: string;
  name: string;
  code: string;
  constructor: string;
  points: number;
  wins: number;
  position: number;
}

export interface F1Data {
  season: string;
  lastRound: number;
  racesDone: number;
  remainingRaces: number;
  remainingSprints: number;
  drivers: F1Driver[];
}

// ─── Jolpica response shapes (only the bits we read) ───────────────────────
interface StandingsResponse {
  MRData?: {
    StandingsTable?: {
      StandingsLists?: Array<{
        season?: string;
        round?: string;
        DriverStandings?: Array<{
          position?: string;
          points?: string;
          wins?: string;
          Driver?: { driverId?: string; givenName?: string; familyName?: string; code?: string };
          Constructors?: Array<{ name?: string }>;
        }>;
      }>;
    };
  };
}

interface ScheduleResponse {
  MRData?: {
    RaceTable?: {
      Races?: Array<{ round?: string; raceName?: string; date?: string; Sprint?: unknown }>;
    };
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Jolpica ${res.status} for ${url}`);
  return (await res.json()) as T;
}

/** -ln(-ln(U)) — a standard Gumbel(0,1) draw. */
function gumbel(): number {
  const u = Math.random();
  return -Math.log(-Math.log(u + 1e-12) + 1e-12);
}

/** Draw a finishing order over driver indices via Plackett–Luce + Gumbel. */
function drawOrder(strength: number[]): number[] {
  return strength
    .map((s, i) => ({ i, key: s / NOISE_SCALE + gumbel() }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.i);
}

export const f1Engine: SportEngine<F1Data> = {
  sport: "f1",

  async load(): Promise<F1Data> {
    const [standings, schedule] = await Promise.all([
      getJson<StandingsResponse>(`${BASE}/current/driverstandings/?limit=100`),
      getJson<ScheduleResponse>(`${BASE}/current/?limit=100`),
    ]);

    const list = standings.MRData?.StandingsTable?.StandingsLists?.[0];
    const season = list?.season ?? new Date().getUTCFullYear().toString();
    const lastRound = Number.parseInt(list?.round ?? "0", 10) || 0;

    const drivers: F1Driver[] = (list?.DriverStandings ?? []).map((d) => ({
      id: d.Driver?.driverId ?? `${d.Driver?.familyName ?? "driver"}`.toLowerCase(),
      name: `${d.Driver?.givenName ?? ""} ${d.Driver?.familyName ?? ""}`.trim(),
      code: d.Driver?.code ?? (d.Driver?.familyName ?? "").slice(0, 3).toUpperCase(),
      constructor: d.Constructors?.[0]?.name ?? "—",
      points: Number.parseFloat(d.points ?? "0") || 0,
      wins: Number.parseInt(d.wins ?? "0", 10) || 0,
      position: Number.parseInt(d.position ?? "0", 10) || 0,
    }));

    const races = schedule.MRData?.RaceTable?.Races ?? [];
    const remaining = races.filter((r) => (Number.parseInt(r.round ?? "0", 10) || 0) > lastRound);
    const remainingRaces = remaining.length;
    const remainingSprints = remaining.filter((r) => Boolean(r.Sprint)).length;

    return {
      season,
      lastRound,
      racesDone: lastRound,
      remainingRaces,
      remainingSprints,
      drivers,
    };
  },

  competitors(data: F1Data): Competitor[] {
    return data.drivers.map((d, i) => ({
      id: d.id,
      name: d.name,
      subtitle: d.constructor,
      points: d.points,
      highlight: i === 0,
    }));
  },

  analyse(data: F1Data, targetId: string): AnalysisResult {
    const { drivers, remainingRaces, remainingSprints, racesDone } = data;
    const target = drivers.find((d) => d.id === targetId) ?? drivers[0];
    const leader = drivers[0];
    const maxRem = maxRemaining(remainingRaces, remainingSprints);
    const seasonOver = remainingRaces === 0 && remainingSprints === 0;

    const possibility = buildPossibility(target, leader, drivers, maxRem, remainingRaces, seasonOver);
    const probabilities = simulate(drivers, racesDone, remainingRaces, remainingSprints);

    const targetProb = probabilities.find((p) => p.id === target.id) ?? {
      id: target.id,
      name: target.name,
      probability: 0,
    };
    const rivals = probabilities.filter((p) => p.id !== target.id).slice(0, 3);

    return {
      sport: "f1",
      target: targetProb,
      rivals,
      possibility,
      path: buildScenario(target, leader, drivers, maxRem, remainingRaces),
      meta: {
        season: data.season,
        round: data.lastRound,
        remainingRaces,
        remainingSprints,
        pointsAvailable: maxRem,
      },
    };
  },
};

function buildPossibility(
  target: F1Driver,
  leader: F1Driver,
  drivers: F1Driver[],
  maxRem: number,
  remainingRaces: number,
  seasonOver: boolean,
): PossibilityVerdict {
  const isLeader = target.id === leader.id;

  if (isLeader) {
    const second = drivers[1];
    const lead = second ? target.points - second.points : target.points;
    const clinched = seasonOver ? true : lead > maxRem;
    return {
      alive: true,
      clinched,
      headline: clinched
        ? seasonOver
          ? `${target.name} is the champion.`
          : `${target.name} has mathematically clinched the title — uncatchable.`
        : `${target.name} leads by ${lead} with ${maxRem} still on the table.`,
      facts: [
        { label: "Championship lead", value: `${lead} pts over ${second?.name ?? "the field"}` },
        { label: "Points still available", value: `${maxRem}` },
        {
          label: "Clinch margin",
          value: clinched ? "Title secured" : `needs lead > ${maxRem} (currently ${lead})`,
        },
      ],
    };
  }

  const gap = leader.points - target.points;
  const alive = !seasonOver && target.points + maxRem >= leader.points;
  const rivalsAhead = drivers.filter((d) => d.points > target.points).length;
  const avgNeeded = remainingRaces > 0 ? gap / remainingRaces : gap;

  return {
    alive,
    clinched: false,
    headline: alive
      ? `${target.name} is still alive — ${gap} behind ${leader.name}, ${maxRem} to play for.`
      : `${target.name} is mathematically eliminated — ${gap} behind with only ${maxRem} left.`,
    facts: [
      { label: "Gap to leader", value: `${gap} pts behind ${leader.name}` },
      { label: "Points still available", value: `${maxRem}` },
      { label: "Rivals ahead", value: `${rivalsAhead}` },
      {
        label: "Avg needed to catch",
        value: alive ? `out-score the leader by ~${avgNeeded.toFixed(1)} pts/race` : "—",
      },
    ],
  };
}

function buildScenario(
  target: F1Driver,
  leader: F1Driver,
  drivers: F1Driver[],
  maxRem: number,
  remainingRaces: number,
): AnalysisResult["path"] {
  if (target.id === leader.id) {
    const second = drivers[1];
    const lead = second ? target.points - second.points : target.points;
    return [
      { label: "Protect the lead", detail: `Hold the ${lead}-pt margin over ${second?.name ?? "the field"}.` },
      { label: "Clinch", detail: `Extend the lead beyond ${maxRem} to make it mathematically safe.` },
    ];
  }
  const gap = leader.points - target.points;
  const winsNeeded = Math.ceil(gap / RACE_WIN_POINTS);
  return [
    {
      label: "Maximise",
      detail: `Win ${Math.min(winsNeeded, remainingRaces)} of the last ${remainingRaces} races — close the ${gap}-pt gap.`,
    },
    {
      label: "Rivals slip",
      detail: `${leader.name} (and others ahead) must drop points; out-score the leader every weekend.`,
    },
    {
      label: "Maths",
      detail: `Average ~${(gap / Math.max(remainingRaces, 1)).toFixed(1)} pts/race more than the leader to overhaul them.`,
    },
  ];
}

/** Plackett–Luce Monte Carlo over the remaining schedule. */
function simulate(
  drivers: F1Driver[],
  racesDone: number,
  remainingRaces: number,
  remainingSprints: number,
): ProbabilityEntry[] {
  const n = drivers.length;
  if (n === 0) return [];
  const done = Math.max(racesDone, 1);
  // Strength = points-per-race so far, floored so backmarkers aren't zero,
  // then shrunk toward the field mean (early-season form is a small sample).
  const ppr = drivers.map((d) => Math.max(d.points / done, 1));
  const mean = ppr.reduce((a, b) => a + b, 0) / ppr.length;
  const strength = ppr.map((s) => Math.max(mean + (s - mean) * FORM_SHRINK, 0.5));
  const base = drivers.map((d) => d.points);
  const wins = new Array<number>(n).fill(0);

  if (remainingRaces === 0 && remainingSprints === 0) {
    // Season over — champion is simply the points leader.
    let best = 0;
    for (let i = 1; i < n; i++) if (base[i] > base[best]) best = i;
    wins[best] = SIMS;
  } else {
    for (let s = 0; s < SIMS; s++) {
      const totals = base.slice();
      for (let r = 0; r < remainingRaces; r++) {
        const order = drawOrder(strength);
        for (let pos = 0; pos < order.length; pos++) totals[order[pos]] += racePoints(pos + 1);
      }
      for (let r = 0; r < remainingSprints; r++) {
        const order = drawOrder(strength);
        for (let pos = 0; pos < order.length; pos++) totals[order[pos]] += sprintPoints(pos + 1);
      }
      let champ = 0;
      for (let i = 1; i < n; i++) if (totals[i] > totals[champ]) champ = i;
      wins[champ]++;
    }
  }

  return drivers
    .map((d, i) => ({ id: d.id, name: d.name, probability: wins[i] / SIMS }))
    .sort((a, b) => b.probability - a.probability);
}
