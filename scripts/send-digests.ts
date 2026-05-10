/**
 * Manual one-shot digest runner. The scheduler does this daily at
 * 09:00 UTC; this script lets the operator trigger immediately for
 * debugging or for the very first send after Resend domain
 * verification lands.
 *
 * Usage:
 *   npm run send-digests                       # sends to everyone due
 *   npm run send-digests -- --dry              # report what would send
 *   npm run send-digests -- --email a@b.com    # only that address
 *
 * The internal `MIN_SEND_GAP_HOURS` throttle (lib/jobs/digest.ts) is
 * bypassed when --email targets a single recipient, so this is also
 * the right path for a "resend my digest" support gesture.
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { runDigest } from "../lib/jobs/digest";

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const emailArgIndex = args.indexOf("--email");
  const onlyEmail =
    emailArgIndex >= 0 ? args[emailArgIndex + 1]?.trim() : undefined;

  console.log(
    `→ Running digest${dryRun ? " (dry run)" : ""}${onlyEmail ? ` for ${onlyEmail}` : ""}…`,
  );
  const start = Date.now();
  const stats = await runDigest({ dryRun, onlyEmail });
  const seconds = ((Date.now() - start) / 1000).toFixed(1);

  console.log(
    `✓ Done in ${seconds}s · scanned=${stats.scanned} sent=${stats.sent} skipped_no_jobs=${stats.skippedNoJobs} skipped_too_soon=${stats.skippedTooSoon} failed=${stats.failed}`,
  );

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
