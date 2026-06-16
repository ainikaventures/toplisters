/**
 * Manage API keys for the read-only /api/v1/jobs endpoint.
 *
 *   npm run apikey -- create "scan.mjs personal scanner"
 *   npm run apikey -- list
 *   npm run apikey -- revoke tl_live_ab12      # by prefix
 *   npm run apikey -- revoke <id>              # by row id
 *
 * Only the SHA-256 hash is stored; the plaintext key is shown ONCE at
 * creation. (For a zero-DB bootstrap, set JOBS_API_KEYS in the env instead.)
 */
import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../lib/db";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateKey(): string {
  return "tl_live_" + randomBytes(24).toString("hex");
}

async function create(label: string): Promise<void> {
  if (!label) {
    console.error('Usage: npm run apikey -- create "<label>"');
    process.exit(1);
  }
  const key = generateKey();
  const keyPrefix = key.slice(0, 16);
  await prisma.apiKey.create({ data: { label, keyPrefix, keyHash: hashKey(key) } });
  console.log("✓ API key created — store it now, it won't be shown again:\n");
  console.log("  " + key + "\n");
  console.log(`  label:  ${label}`);
  console.log(`  prefix: ${keyPrefix}`);
}

async function list(): Promise<void> {
  const rows = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
  if (!rows.length) {
    console.log("(no API keys)");
    return;
  }
  for (const r of rows) {
    const status = r.revokedAt ? `revoked ${r.revokedAt.toISOString()}` : "active";
    const used = r.lastUsedAt ? r.lastUsedAt.toISOString() : "never";
    console.log(
      `${r.keyPrefix}…  ${r.label}  [${status}]  last used: ${used}  id=${r.id}`,
    );
  }
}

async function revoke(ident: string): Promise<void> {
  if (!ident) {
    console.error("Usage: npm run apikey -- revoke <prefix|id>");
    process.exit(1);
  }
  const rows = await prisma.apiKey.findMany({
    where: {
      revokedAt: null,
      OR: [{ id: ident }, { keyPrefix: { startsWith: ident } }],
    },
  });
  if (!rows.length) {
    console.error(`No active key matching "${ident}"`);
    process.exit(1);
  }
  for (const r of rows) {
    await prisma.apiKey.update({ where: { id: r.id }, data: { revokedAt: new Date() } });
    console.log(`✓ Revoked ${r.keyPrefix}… (${r.label})`);
  }
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "create":
      await create(rest.join(" ").trim());
      break;
    case "list":
      await list();
      break;
    case "revoke":
      await revoke(rest[0] ?? "");
      break;
    default:
      console.error(
        'Usage: npm run apikey -- <create "<label>" | list | revoke <prefix|id>>',
      );
      process.exit(1);
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
