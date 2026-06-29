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
import { demonymToIso2 } from "../flags";

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
  nationality: string;
  /** ISO2 (lowercase) for the flag, or null if the demonym isn't mapped. */
  flag: string | null;
  /** Headshot from Wikipedia, or null when unavailable. */
  photoUrl: string | null;
  points: number;
  wins: number;
  position: number;
  /** Per-race retirement probability, from season results. 0.02–0.40. */
  dnfRate: number;
  /** Recency-weighted points-per-race (recent form), 0 when unknown. */
  recentPpr: number;
}

export interface F1Constructor {
  name: string;
  nationality: string;
  flag: string | null;
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
  constructors: F1Constructor[];
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
          Driver?: {
            driverId?: string;
            givenName?: string;
            familyName?: string;
            code?: string;
            nationality?: string;
            url?: string;
          };
          Constructors?: Array<{ name?: string }>;
        }>;
      }>;
    };
  };
}

interface ConstructorStandingsResponse {
  MRData?: {
    StandingsTable?: {
      StandingsLists?: Array<{
        ConstructorStandings?: Array<{
          position?: string;
          points?: string;
          wins?: string;
          Constructor?: { name?: string; nationality?: string };
        }>;
      }>;
    };
  };
}

interface WikiResponse {
  query?: { pages?: Record<string, { title?: string; thumbnail?: { source?: string } }> };
}

interface ScheduleResponse {
  MRData?: {
    RaceTable?: {
      Races?: Array<{ round?: string; raceName?: string; date?: string; Sprint?: unknown }>;
    };
  };
}

interface ResultsResponse {
  MRData?: {
    RaceTable?: {
      Races?: Array<{
        round?: string;
        Results?: Array<{ points?: string; status?: string; Driver?: { driverId?: string } }>;
      }>;
    };
  };
}

const FORM_DECAY = 0.85; // weight of each race older than the last, for recent form

/** A classified finish (won/lapped) vs a retirement (DNF). */
function isFinish(status: string | undefined): boolean {
  return status === "Finished" || /^\+\d+ Lap/.test(status ?? "");
}

interface DriverForm {
  dnfRate: number;
  recentPpr: number;
}

/** Per-driver reliability + recent form from the season's race results. */
function computeForm(results: ResultsResponse, lastRound: number): Map<string, DriverForm> {
  const races = results.MRData?.RaceTable?.Races ?? [];
  const acc = new Map<string, { entries: number; dnfs: number; wpts: number; wsum: number }>();
  for (const race of races) {
    const round = Number.parseInt(race.round ?? "0", 10) || 0;
    const weight = FORM_DECAY ** Math.max(0, lastRound - round);
    for (const r of race.Results ?? []) {
      const id = r.Driver?.driverId;
      if (!id) continue;
      const e = acc.get(id) ?? { entries: 0, dnfs: 0, wpts: 0, wsum: 0 };
      e.entries++;
      if (!isFinish(r.status)) e.dnfs++;
      e.wpts += (Number.parseFloat(r.points ?? "0") || 0) * weight;
      e.wsum += weight;
      acc.set(id, e);
    }
  }
  const out = new Map<string, DriverForm>();
  for (const [id, e] of acc) {
    out.set(id, {
      dnfRate: Math.min(0.4, Math.max(0.02, e.entries ? e.dnfs / e.entries : 0.1)),
      recentPpr: e.wsum > 0 ? e.wpts / e.wsum : 0,
    });
  }
  return out;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Jolpica ${res.status} for ${url}`);
  return (await res.json()) as T;
}

/** Wikipedia article title from an Ergast Driver.url. */
function wikiTitle(url: string | undefined): string | null {
  const m = url?.match(/\/wiki\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

const PHOTO_CACHE_KEY = "tl-f1-photos-v1";
const PHOTO_TTL_MS = 24 * 60 * 60 * 1000;

function readPhotoCache(): Record<string, string> | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(PHOTO_CACHE_KEY);
    if (!raw) return null;
    const { ts, map } = JSON.parse(raw) as { ts: number; map: Record<string, string> };
    return Date.now() - ts < PHOTO_TTL_MS ? map : null;
  } catch {
    return null;
  }
}
function writePhotoCache(map: Map<string, string>): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify({ ts: Date.now(), map: Object.fromEntries(map) }));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

/**
 * One batched Wikipedia PageImages request → driverId → headshot URL. CORS-open
 * (origin=*). Cached in localStorage for 24h (photos rarely change). Best-effort:
 * any failure just means no photos (the UI falls back to the code badge).
 */
async function fetchDriverPhotos(
  entries: { id: string; title: string | null }[],
): Promise<Map<string, string>> {
  const cached = readPhotoCache();
  if (cached) return new Map(Object.entries(cached));

  const valid = entries.filter((e) => e.title) as { id: string; title: string }[];
  if (!valid.length) return new Map();
  const titles = encodeURIComponent(valid.map((e) => e.title).join("|"));
  try {
    const json = await getJson<WikiResponse>(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=200&redirects=1&origin=*&titles=${titles}`,
    );
    const byTitle = new Map<string, string>();
    for (const page of Object.values(json.query?.pages ?? {})) {
      if (page.title && page.thumbnail?.source) byTitle.set(page.title.toLowerCase(), page.thumbnail.source);
    }
    const out = new Map<string, string>();
    for (const e of valid) {
      const src = byTitle.get(e.title.replace(/_/g, " ").toLowerCase());
      if (src) out.set(e.id, src);
    }
    writePhotoCache(out);
    return out;
  } catch {
    return new Map();
  }
}

/** -ln(-ln(U)) — a standard Gumbel(0,1) draw. */
function gumbel(): number {
  const u = Math.random();
  return -Math.log(-Math.log(u + 1e-12) + 1e-12);
}

/**
 * Simulate one race/sprint into `totals`: each driver retires with their DNF
 * probability (scaled for sprints), the finishers are ordered by Plackett–Luce
 * (strength + Gumbel), and points are awarded by finishing position. Retired
 * drivers score nothing — the reliability lever the old model lacked.
 */
function scoreSession(
  totals: number[],
  strength: number[],
  dnf: number[],
  dnfScale: number,
  points: (pos: number) => number,
): void {
  const ordered: { i: number; key: number }[] = [];
  for (let i = 0; i < strength.length; i++) {
    if (Math.random() > dnf[i] * dnfScale) ordered.push({ i, key: strength[i] / NOISE_SCALE + gumbel() });
  }
  ordered.sort((a, b) => b.key - a.key);
  for (let pos = 0; pos < ordered.length; pos++) totals[ordered[pos].i] += points(pos + 1);
}

export const f1Engine: SportEngine<F1Data> = {
  sport: "f1",

  async load(): Promise<F1Data> {
    const [standings, schedule, results, constructorStandings] = await Promise.all([
      getJson<StandingsResponse>(`${BASE}/current/driverstandings/?limit=100`),
      getJson<ScheduleResponse>(`${BASE}/current/?limit=100`),
      // Every race result this season → per-driver reliability + recent form.
      // Tolerate failure: the model falls back to season pace + a default DNF.
      getJson<ResultsResponse>(`${BASE}/current/results/?limit=2000`).catch(() => ({}) as ResultsResponse),
      getJson<ConstructorStandingsResponse>(`${BASE}/current/constructorstandings/?limit=100`).catch(
        () => ({}) as ConstructorStandingsResponse,
      ),
    ]);

    const list = standings.MRData?.StandingsTable?.StandingsLists?.[0];
    const season = list?.season ?? new Date().getUTCFullYear().toString();
    const lastRound = Number.parseInt(list?.round ?? "0", 10) || 0;
    const form = computeForm(results, lastRound);

    const rawDrivers = list?.DriverStandings ?? [];
    const photos = await fetchDriverPhotos(
      rawDrivers.map((d) => ({
        id: d.Driver?.driverId ?? `${d.Driver?.familyName ?? "driver"}`.toLowerCase(),
        title: wikiTitle(d.Driver?.url),
      })),
    );

    const drivers: F1Driver[] = rawDrivers.map((d) => {
      const id = d.Driver?.driverId ?? `${d.Driver?.familyName ?? "driver"}`.toLowerCase();
      const f = form.get(id);
      const nationality = d.Driver?.nationality ?? "";
      return {
        id,
        name: `${d.Driver?.givenName ?? ""} ${d.Driver?.familyName ?? ""}`.trim(),
        code: d.Driver?.code ?? (d.Driver?.familyName ?? "").slice(0, 3).toUpperCase(),
        constructor: d.Constructors?.[0]?.name ?? "—",
        nationality,
        flag: demonymToIso2(nationality),
        photoUrl: photos.get(id) ?? null,
        points: Number.parseFloat(d.points ?? "0") || 0,
        wins: Number.parseInt(d.wins ?? "0", 10) || 0,
        position: Number.parseInt(d.position ?? "0", 10) || 0,
        dnfRate: f?.dnfRate ?? 0.1,
        recentPpr: f?.recentPpr ?? 0,
      };
    });

    const constructors: F1Constructor[] = (
      constructorStandings.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? []
    ).map((c) => {
      const nationality = c.Constructor?.nationality ?? "";
      return {
        name: c.Constructor?.name ?? "—",
        nationality,
        flag: demonymToIso2(nationality),
        points: Number.parseFloat(c.points ?? "0") || 0,
        wins: Number.parseInt(c.wins ?? "0", 10) || 0,
        position: Number.parseInt(c.position ?? "0", 10) || 0,
      };
    });

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
      constructors,
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
  // Strength blends season pace with recency-weighted recent form, floored so
  // backmarkers aren't zero, then shrunk toward the field mean (a season is a
  // small sample). Reliability (DNF rate) enters as a per-race retirement.
  const seasonPpr = drivers.map((d) => Math.max(d.points / done, 1));
  const blended = drivers.map((d, i) =>
    d.recentPpr > 0 ? 0.55 * Math.max(d.recentPpr, 1) + 0.45 * seasonPpr[i] : seasonPpr[i],
  );
  const mean = blended.reduce((a, b) => a + b, 0) / n;
  const strength = blended.map((s) => Math.max(mean + (s - mean) * FORM_SHRINK, 0.5));
  const dnf = drivers.map((d) => d.dnfRate);
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
      for (let r = 0; r < remainingRaces; r++) scoreSession(totals, strength, dnf, 1, racePoints);
      // Sprints are shorter — roughly half the retirement risk of a Grand Prix.
      for (let r = 0; r < remainingSprints; r++) scoreSession(totals, strength, dnf, 0.5, sprintPoints);
      let champ = 0;
      for (let i = 1; i < n; i++) if (totals[i] > totals[champ]) champ = i;
      wins[champ]++;
    }
  }

  return drivers
    .map((d, i) => ({
      id: d.id,
      name: d.name,
      probability: wins[i] / SIMS,
      iso2: d.flag,
      photoUrl: d.photoUrl,
    }))
    .sort((a, b) => b.probability - a.probability);
}
