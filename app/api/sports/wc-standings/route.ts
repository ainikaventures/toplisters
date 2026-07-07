import { NextResponse } from "next/server";
import { fetchWcStandings, applyStandings } from "@/lib/sports/worldcup/standings";
import { WC_TEAMS } from "@/lib/sports/worldcup/teams";

/**
 * Live World Cup teams (Elo seed + football-data overlay) for the client to
 * poll, so the standings/bracket stay current without a full reload. The
 * football-data key stays server-side here (the feed isn't CORS-open).
 */
export const runtime = "nodejs";
export const revalidate = 60;

export async function GET(): Promise<NextResponse> {
  const teams = applyStandings(WC_TEAMS, await fetchWcStandings());
  return NextResponse.json(
    { teams, fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
  );
}
