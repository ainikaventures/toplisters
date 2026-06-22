import "server-only";
import type { WcTeam } from "./teams";

/**
 * Live World Cup group standings from football-data.org (free token, server-
 * side only — the key never reaches the browser, and the API isn't CORS-open).
 * Overlays real points / played / W-D-L / goals onto the curated Elo dataset;
 * falls back to the Elo projection when the key/feed is unavailable.
 *
 *   FOOTBALL_DATA_API_KEY = free token from football-data.org/client/register
 */

const ENDPOINT = "https://api.football-data.org/v4/competitions/WC/standings";

export interface TeamStats {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

interface FdRow {
  team?: { name?: string; shortName?: string; tla?: string };
  playedGames?: number;
  won?: number;
  draw?: number;
  lost?: number;
  points?: number;
  goalsFor?: number;
  goalsAgainst?: number;
}

/** Normalise a code/name to a match key (lowercase, no accents/punctuation). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Fetch live standings keyed by team code/name. null when unavailable. */
export async function fetchWcStandings(): Promise<Map<string, TeamStats> | null> {
  const key = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (!key) return null;
  try {
    const res = await fetch(ENDPOINT, {
      headers: { "X-Auth-Token": key },
      next: { revalidate: 120 },
    });
    if (!res.ok) {
      console.error(`[wc-standings] football-data ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { standings?: Array<{ type?: string; table?: FdRow[] }> };
    const out = new Map<string, TeamStats>();
    for (const s of json.standings ?? []) {
      if (s.type && s.type !== "TOTAL") continue; // group-stage TOTAL tables
      for (const row of s.table ?? []) {
        const stats: TeamStats = {
          played: row.playedGames ?? 0,
          won: row.won ?? 0,
          drawn: row.draw ?? 0,
          lost: row.lost ?? 0,
          gf: row.goalsFor ?? 0,
          ga: row.goalsAgainst ?? 0,
          points: row.points ?? 0,
        };
        const t = row.team ?? {};
        for (const id of [t.tla, t.name, t.shortName]) {
          if (id) out.set(norm(id), stats);
        }
      }
    }
    return out.size ? out : null;
  } catch (err) {
    console.error("[wc-standings]", (err as Error).message);
    return null;
  }
}

/**
 * Overlay live stats onto the teams (matched by FIFA code then name). Group
 * points are locked into `result` only once a team has played all 3 games, so
 * mid-group-stage simulations still play out the remaining fixtures.
 */
export function applyStandings(
  teams: WcTeam[],
  overlay: Map<string, TeamStats> | null,
): WcTeam[] {
  if (!overlay) return teams;
  return teams.map((t) => {
    const stats = overlay.get(norm(t.code)) ?? overlay.get(norm(t.name));
    if (!stats) return t;
    const merged: WcTeam = {
      ...t,
      played: stats.played,
      won: stats.won,
      drawn: stats.drawn,
      lost: stats.lost,
      gf: stats.gf,
      ga: stats.ga,
    };
    if (stats.played >= 3) merged.result = stats.points;
    return merged;
  });
}
