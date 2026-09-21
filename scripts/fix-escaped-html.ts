/**
 * Repair job descriptions that were stored as entity-escaped HTML.
 *
 *   npm run fix:escaped-html            # apply
 *   npm run fix:escaped-html -- --dry   # report only
 *
 * Some feeds hand us HTML that has already been escaped, so the whole
 * description arrived as `&lt;p&gt;&lt;strong&gt;About…`. sanitize-html
 * treats that as text (it isn't markup), so it survived cleaning and then
 * rendered as literal `<p>` on the job page — 21 of 60 sampled live
 * listings were affected in Aug 2026.
 *
 * cleanHtml/htmlToPlainText now un-escape first, which fixes everything
 * ingested from here on. This rewrites the rows that already exist.
 *
 * Idempotent: rows already clean produce identical output and are skipped.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { cleanHtml, htmlToPlainText } from "../lib/sources/utils";

const DRY = process.argv.includes("--dry");
const BATCH = 500;

async function main() {
  // Only rows that actually look escaped — cheap SQL prefilter so we don't
  // pull the whole descriptions column into memory.
  const candidates = await prisma.$queryRaw<
    { id: string; description_html: string; description_text: string }[]
  >`
    SELECT id, description_html, description_text
    FROM jobs
    WHERE description_html LIKE '%&lt;%'
       OR description_text LIKE '%&lt;%'
  `;

  console.log(`${candidates.length} rows contain escaped markup`);

  const updates: { id: string; html: string; text: string }[] = [];
  for (const row of candidates) {
    const html = cleanHtml(row.description_html);
    // Prefer deriving text from the repaired HTML — that is what the rest
    // of the pipeline does, and it drops any leftover tag noise.
    const text = htmlToPlainText(html) || htmlToPlainText(row.description_text);
    if (html !== row.description_html || text !== row.description_text) {
      updates.push({ id: row.id, html, text });
    }
  }

  console.log(`${updates.length} rows would change`);

  if (updates.length > 0) {
    const sample = updates[0];
    const before = candidates.find((c) => c.id === sample.id)!.description_html;
    console.log(`\nexample ${sample.id}`);
    console.log(`  before: ${before.slice(0, 110)}`);
    console.log(`  after : ${sample.html.slice(0, 110)}`);
  }

  if (DRY) {
    console.log("\n--dry: nothing written");
    return;
  }

  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    await prisma.$transaction(
      chunk.map((u) =>
        prisma.job.update({
          where: { id: u.id },
          data: { descriptionHtml: u.html, descriptionText: u.text },
        }),
      ),
    );
    written += chunk.length;
    console.log(`  ${written}/${updates.length}`);
  }
  console.log(`repaired ${written} rows`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
