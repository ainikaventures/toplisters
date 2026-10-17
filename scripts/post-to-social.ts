/**
 * Manual one-shot social poster. The scheduler runs this 3×/day in
 * production; this script lets the operator trigger immediately —
 * useful for the first post after wiring up a new platform token, or
 * for dry-run smoke tests before flipping SOCIAL_*_ENABLED to "1".
 *
 * Usage:
 *   npm run post-to-social               # post N jobs to every enabled platform
 *   npm run post-to-social -- --dry      # show what would be posted, no API calls
 *   npm run post-to-social -- --max 1    # cap to 1 post/platform this run
 *   npm run post-to-social -- --cards    # country digest + company spotlight posts instead
 *   npm run post-to-social -- --cards --dry
 *
 * Platform enablement is driven by env vars — see .env.example
 * SOCIAL_FACEBOOK_ENABLED / SOCIAL_TELEGRAM_ENABLED / SOCIAL_TWITTER_ENABLED.
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { runCardPosting, runSocialPosting } from "../lib/social/runner";
import { SOCIAL_PLATFORMS, enabledPlatforms } from "../lib/social";

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const maxIdx = args.indexOf("--max");
  const maxPerPlatform =
    maxIdx >= 0 ? Number.parseInt(args[maxIdx + 1] ?? "", 10) : undefined;

  const enabled = enabledPlatforms();
  if (enabled.length === 0) {
    const off = SOCIAL_PLATFORMS.map(
      (p) => `${p.platform} (enabled=${p.enabled() ? "yes" : "no"})`,
    ).join(", ");
    console.log(
      `→ No platforms enabled. Set SOCIAL_*_ENABLED=1 and the required tokens. Status: ${off}`,
    );
    await prisma.$disconnect();
    return;
  }

  if (args.includes("--cards")) {
    console.log(`→ Running card posts${dryRun ? " (dry run)" : ""}…`);
    const cardStats = await runCardPosting({ dryRun });
    for (const s of cardStats) {
      console.log(`  ${s.platform} ${s.kind}: posted=${s.posted} failed=${s.failed} ${s.items.join(" | ")}`);
    }
    await prisma.$disconnect();
    return;
  }

  console.log(
    `→ Running social poster${dryRun ? " (dry run)" : ""} for: ${enabled.map((p) => p.label).join(", ")}…`,
  );
  const start = Date.now();
  const stats = await runSocialPosting({
    dryRun,
    maxPerPlatform: Number.isFinite(maxPerPlatform) ? maxPerPlatform : undefined,
  });
  const seconds = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`✓ Done in ${seconds}s`);
  for (const s of stats) {
    console.log(
      `  ${s.platform}: attempted=${s.attempted} posted=${s.posted} failed=${s.failed} cap_remaining=${s.capRemaining}`,
    );
  }

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
