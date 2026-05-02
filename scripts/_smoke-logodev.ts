// Disposable smoke test for the Logo.dev resolver. Run via:
//   npx tsx scripts/_smoke-logodev.ts
import "dotenv/config";
import { resolveCompanyLogo } from "../lib/logos";
import { prisma } from "../lib/db";

const cases = ["Vonage", "New Relic", "MLB Network", "Loadsmart", "Imagine Pediatrics"];

(async () => {
  for (const name of cases) {
    const url = await resolveCompanyLogo(name);
    console.log(`${name.padEnd(22)} → ${url ?? "null"}`);
  }
  await prisma.$disconnect();
})();
