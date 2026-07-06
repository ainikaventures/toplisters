import { prisma } from "@/lib/db";

/**
 * The employer→ATS registry: how to pull each company's jobs directly. Grows
 * via `discover-ats --save`; the direct-ATS adapters union these slugs with
 * their code defaults + env, so new employers ingest with no code change — the
 * path toward dropping aggregator APIs where direct coverage is strong.
 */

export type AtsPlatform = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workday";

/**
 * Enabled slugs for a platform from the DB registry. Resilient: returns [] if
 * the table doesn't exist yet (pre-migration) or the DB is unreachable, so
 * aggregation never breaks on a registry hiccup.
 */
export async function registrySlugs(platform: AtsPlatform): Promise<string[]> {
  try {
    const rows = await prisma.employerAtsSource.findMany({
      where: { platform, enabled: true },
      select: { slug: true },
    });
    return rows.map((r) => r.slug);
  } catch {
    return [];
  }
}

export interface DiscoveredBoard {
  platform: AtsPlatform;
  slug: string;
  companyName: string;
  normalizedName: string;
  confidence?: string | null;
  jobCount?: number;
}

/** Upsert a discovered board into the registry (idempotent on platform+slug). */
export async function saveAtsSource(board: DiscoveredBoard): Promise<void> {
  await prisma.employerAtsSource.upsert({
    where: { platform_slug: { platform: board.platform, slug: board.slug } },
    create: {
      platform: board.platform,
      slug: board.slug,
      companyName: board.companyName,
      normalizedName: board.normalizedName,
      confidence: board.confidence ?? null,
      jobCount: board.jobCount ?? 0,
    },
    update: {
      companyName: board.companyName,
      normalizedName: board.normalizedName,
      confidence: board.confidence ?? null,
      jobCount: board.jobCount ?? 0,
    },
  });
}
