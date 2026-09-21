/**
 * Job-detail path → job id.
 *
 * Deliberately dependency-free and NOT `server-only`: this is shared by the
 * /api/track route (Next), the backfill script and the rollup (both plain
 * tsx under the worker, which boots without Next). Keep it that way — see
 * the note at the top of lib/analytics/rollup.ts.
 *
 * Canonical detail path is `/job/<id>/<slug>`; `/job/<id>` also resolves
 * (it redirects to the slugged form, but a beacon can still report it).
 */
const JOB_PATH = /^\/job\/([A-Za-z0-9_-]{1,64})(?:\/|$)/;

export function jobIdFromPath(path: string): string | null {
  const match = JOB_PATH.exec(path);
  return match ? match[1] : null;
}
