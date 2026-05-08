// Prisma CLI configuration. Two URLs are honoured:
//   - MIGRATION_DATABASE_URL (preferred): owner role with DDL rights, used
//     by `prisma migrate` / `db push` / `db pull`. The runtime app user
//     (DATABASE_URL) is intentionally restricted to DML so a leaked app
//     credential can't drop tables.
//   - DATABASE_URL: fallback when MIGRATION_DATABASE_URL is unset, so dev
//     setups that don't bother with role-splitting keep working.
// Runtime queries from lib/db.ts read DATABASE_URL directly via the
// PrismaPg adapter — they never see this config.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["MIGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"],
  },
});
