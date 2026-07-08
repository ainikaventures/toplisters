/**
 * CI guard for the worker's import graph.
 *
 * The worker runs as plain `tsx scripts/worker.ts` — there is NO Next bundler.
 * If anything in its reachable graph transitively imports a `server-only`
 * module (or a Next-only API like next/headers, next/navigation, next/cache),
 * the worker crash-loops at boot and silently halts EVERY schedule — while
 * `next build` stays green, because Next PROVIDES `server-only`. That exact gap
 * took the scheduler down (df35d13).
 *
 * This dry-imports the worker's reachable modules and fails if any can't
 * resolve under plain Node/tsx. Set dummy DATABASE_URL / REDIS_URL so lib/db
 * (Prisma) and BullMQ construct lazily without throwing — any remaining throw
 * is a real import-resolution failure (i.e. a server-only / Next-only leak).
 *
 * Usage: npm run check:worker
 */

const MODULES = [
  "../lib/sources/pipeline", // → lib/api/sources (the module that broke prod), classifiers, geocode
  "../lib/jobs/scheduler", // → all source adapters
  "../lib/jobs/aggregate", // → pipeline
  "../lib/jobs/stale", // → companies/rebuild, sponsors/refresh, social/runner, visa-pathways
];

(async () => {
  for (const m of MODULES) {
    try {
      await import(m);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`✗ worker import failed for ${m}:\n    ${msg}`);
      console.error(
        "\nThe worker runs without Next — nothing in its graph may import a " +
          "`server-only` or Next-only module. Move shared pure helpers to a neutral module.",
      );
      process.exit(1);
    }
  }
  console.log("✓ worker import graph resolves under plain tsx (no server-only / Next-only leak)");
  process.exit(0);
})();
