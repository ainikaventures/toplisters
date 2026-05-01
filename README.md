# Toplisters.xyz

Location-based job listing platform with a Radio Garden-style 3D globe as the primary discovery interface. Aggregates jobs from free public APIs, free for employers to post, monetised later via AdSense and featured listings.

A product by [Ainika](https://ainika.xyz), developed by [Lyrava](https://lyrava.com).

Full specification: [`info/PROJECT_SPEC.md`](info/PROJECT_SPEC.md).
Budget & API reference: [`info/BUDGET_AND_APIS.md`](info/BUDGET_AND_APIS.md).

## Stack

- **Next.js 14** App Router + TypeScript
- **Tailwind CSS** + **shadcn/ui**
- **PostgreSQL 16** + **Prisma**
- **Redis** + **BullMQ** (caching + job queues)
- **Globe.gl** for 3D globe
- **Postgres FTS** for search (`tsvector`)
- **Docker Compose** for local Postgres/Redis
- **Caddy** + Hetzner VPS for production (added in deployment phase)

## Local development

Prerequisites: Node 20+, Docker (or Colima), npm.

```bash
# 1. Install dependencies
npm install

# 2. Copy env template
cp .env.example .env.local
cp .env.example .env  # Prisma CLI reads this one

# 3. Start Postgres + Redis
docker compose up -d

# 4. Apply Prisma migrations (none yet at this stage)
npx prisma migrate dev

# 5. Run Next.js
npm run dev
```

App at <http://localhost:3000>.

## Status

**Phase 1 — MVP scaffold in progress.** See [`info/PROJECT_SPEC.md`](info/PROJECT_SPEC.md) for the phased build plan.
