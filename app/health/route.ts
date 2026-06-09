import { NextResponse } from "next/server";

/**
 * Platform liveness probe for the Coolify/Traefik proxy.
 *
 * Hard contract: returns 200, no auth, and touches NO dependencies
 * (no Postgres, no Redis). It must answer purely from the web process
 * so the proxy can tell the container is up even while DB/Redis are
 * still warming or briefly unreachable. For a dependency-aware probe
 * (DB + Redis round-trips) use /api/health instead.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    { status: "ok" },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
