/**
 * One-shot cleanup: deactivate Reed-via-Appcast rows that landed before
 * the syndicator filter shipped (lib/sources/reed.ts). Idempotent —
 * running it on a clean DB is a no-op.
 *
 * Reed exposes an ad-syndication tier where `employerName` is the
 * syndicator (Appcast / Appcastenterprise) rather than the real
 * employer; those rows have no recoverable brand and were causing
 * dozens of identical "AP" InitialsAvatar tiles to dominate the
 * listing grid. The adapter now skips them at ingest, but historic
 * rows need an explicit pass.
 *
 * Usage:
 *   npm run deactivate-appcast            # apply
 *   npm run deactivate-appcast -- --dry   # preview only
 */

import "dotenv/config";
import { prisma } from "../lib/db";

(async () => {
  const dryRun = process.argv.includes("--dry");

  // Match any case-insensitive variant: "Appcast", "Appcast Enterprise",
  // "Appcastenterprise". The Postgres ~* operator + ^appcast prefix
  // catches all of those without sweeping in unrelated companies.
  const where = {
    isActive: true,
    companyName: { startsWith: "Appcast", mode: "insensitive" as const },
  };

  const count = await prisma.job.count({ where });
  console.log(`Found ${count} active Appcast-syndicated rows`);

  if (count === 0 || dryRun) {
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.job.updateMany({
    where,
    data: { isActive: false },
  });
  console.log(`✓ Deactivated ${result.count} rows`);

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
