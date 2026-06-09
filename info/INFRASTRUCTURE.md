# Toplisters — Development Constraints & Infrastructure Spec

You are working on Toplisters.xyz, a globally-aware job aggregator. This document
defines hard constraints on how the codebase must be built. Treat these as
non-negotiable unless I explicitly override them in a session.

## How to use this document

This spec is a **living document**. When it conflicts with existing working code,
default to overriding the spec and updating it to match reality — unless the
existing code is genuinely broken or insecure. Do not downgrade working
dependencies to satisfy a prophylactic rule.

When you find a conflict:
1. Surface it clearly (as an audit, like Claude Code's standard practice)
2. Recommend whether to fix the code or amend the spec
3. Wait for my decision before making structural changes

## Stack (locked unless explicitly amended)

- **Web:** Next.js 14 App Router, SSR, Node 20, single process
- **Worker:** Node 20 + BullMQ, concurrency = 1 per source
- **Postgres:** 16-alpine, with FTS via tsvector/GIN — NO Elasticsearch
- **Redis:** 7-alpine, for BullMQ queues + cache only
- **Reverse proxy:** Traefik v3 (managed by Coolify, auto-TLS) — *was Caddy 2; see 2026-06-09 amendment*
- **Orchestration:** Coolify PaaS, deploy via git-push to `main` (see `DEPLOY.md`) — *was docker-compose.prod.yml + `./deploy.sh`; see 2026-06-09 amendment*
- **ORM:** Prisma 7 (locked at current minor version — already migrated and stable; do NOT bump to v8 when it lands without an explicit decision)

## Deployment target (locked)

Production runs on a single OVHcloud VPS-1 (4 vCore / 8 GB RAM / 75 GB NVMe)
in Gravelines, France. This box is SHARED with a second app (SplitAI). Design
accordingly:

- Hard memory budget for Toplisters: 3.5 GB resident steady-state
- Hard disk budget: 35 GB (Postgres data + GeoNames + cached banners + Docker images)
- CPU: shared 4 vCore, assume 2 vCore equivalent under load
- Bandwidth: 400 Mbps unmetered, but Cloudflare is in front so origin traffic is light

## Architectural principles (non-negotiable)

### 1. Two-app isolation on shared box
- Run in a dedicated Docker network (`toplisters_net`)
- Container names follow Docker Compose convention: `toplisters-<service>` (hyphens)
- Postgres container on internal port **5433** (NOT 5432, which is the default and would collide with SplitAI conventions)
- Redis on **DB index 1** (DB 0 reserved as unused-default; SplitAI uses DB 2). Even though each app has its own Redis container, pinning indexes preserves migration optionality if Redis is ever consolidated to a managed instance.
- Never assume `localhost:5432` or `localhost:6379` — always env vars
- All container names prefixed `toplisters-`

### 2. Storage separation from day one

Backups and user-facing assets live on **separate object storage** from the VPS,
but they don't have to be on the same provider. Different access patterns warrant
different choices:

- **Backups (Postgres dumps): Backblaze B2 via rclone** — already integrated. B2 wins on storage cost for write-heavy, read-rare workloads, and egress is free up to 3× stored data which more than covers occasional restores.
- **User-facing assets (if added later, e.g. uploaded logos, OG images served at scale): Cloudflare R2** — free egress is the killer feature when files are served back to users.
- **Cached banners** CAN live on local disk (`/public/banners/`) — they're regeneratable from source, so loss is acceptable.
- The VPS local disk is NEVER the only copy of anything that matters.

### 3. Database isolation
- Postgres database: `toplisters` (dedicated, NOT shared with SplitAI even if same instance)
- Postgres user: `toplisters_app` with rights only to that database (NOT a superuser)
- Connection string ALWAYS via `DATABASE_URL` env var
- No cross-database queries, ever

### 4. Migration-readiness
The DB will eventually move off-box (managed Postgres). Code accordingly:
- No reliance on Postgres extensions beyond what managed providers commonly support (pg_trgm, unaccent, citext are fine; custom C extensions are not)
- All connection logic via env vars, never hardcoded hosts
- Connection pooling via Prisma's pool or `pg-pool`, sized for `min=2, max=10`
- Query patterns must tolerate 5-20ms latency to DB (no chatty N+1, batch where possible)

### 5. Backup contract
- Nightly `pg_dump` to B2 via rclone, retained 14 days
- Weekly full snapshot retained 8 weeks
- GeoNames seed data is committed to repo or fetched from canonical source on rebuild, NOT backed up
- Cached banners are regeneratable, NOT backed up
- Test restore monthly via `scripts/test-restore.sh` — pulls latest dump from B2, restores into scratch DB, runs smoke queries

### 6. Observability
- Sentry for errors (free tier, 5k events/mo)
- Health endpoint at `/api/health` returning DB + Redis status
- BullMQ dashboard at `/admin/bullmq` behind basic auth (note: `/admin/queue` is the moderation UI — do NOT collide). Minimal `Queue.getJobCounts()` page is acceptable; bull-board is acceptable if a richer view is wanted.
- Log to stdout in JSON, Caddy captures, no log shipping yet

## Performance budgets (Toplisters specifically)

- Cold SSR page: < 800ms TTFB
- Globe landing page first paint: < 2s on 4G
- Aggregation worker run: < 10 min for full cycle across all 7 sources
- Postgres FTS query: < 100ms p95 with GIN index
- Sharp banner generation: < 5s per banner, max 50 MB RSS spike

If a change pushes any budget by >20%, flag it before merging.

## What NOT to do

- Do NOT add Elasticsearch / Meilisearch / Typesense — Postgres FTS is the answer
- Do NOT add Kubernetes, Nomad, or any orchestrator — Docker Compose is the answer
- Do NOT add a separate caching layer beyond Redis — Next.js cache + Redis is enough
- Do NOT use Vercel or serverless deployment — this is a long-running stateful app
- Do NOT couple Toplisters code to SplitAI in any way, even though they share a host
- Do NOT migrate backups from B2 to R2 "for consistency" — they serve different purposes
- Do NOT bump Prisma to v8 when it lands without an explicit decision

## Spec amendments log

Track major spec changes here so future agents understand the history:

- **2026-05-08:** Initial spec.
- **2026-05-08:** Amended Prisma constraint from "v6 LTS only" to "v7 locked." Repo had already migrated to v7 before spec was written; downgrading was higher risk than maintaining current state.
- **2026-05-08:** Amended container naming from `toplisters_*` (underscores) to `toplisters-*` (hyphens) to match Docker Compose convention.
- **2026-05-08:** Amended backup target from Cloudflare R2 to Backblaze B2 (already integrated via rclone). R2 reserved for future user-facing assets where free egress matters; B2 is correct for write-heavy, read-rare backup workloads.
- **2026-05-08:** Pinned Redis DB index to 1 (Toplisters) / 2 (SplitAI), DB 0 reserved unused. Each app has its own container so the requirement is currently moot, but the convention preserves optionality if Redis is ever consolidated to managed instance.
- **2026-05-15:** Added first-party visitor analytics (cookieless). New `pageviews` table fed by `/api/track`; country comes from Cloudflare's `CF-IPCountry` header, visitor identity is a daily-rotating sha256(ip+ua+day+`PAGEVIEW_SALT`) truncated to 16 chars. No raw IP/UA at rest; no consent banner needed (legitimate-interest aggregated counting). Powers `/analytics/audience` country-shape dashboard. GA4/PostHog/Clarity remain wired for marketing-funnel use cases.
- **2026-05-15:** Added social auto-posting (Facebook Page, Telegram channel, X/Twitter). New `social_posts` table tracks every (job, platform) post with `@@unique([jobId, platform])` as the dedupe gate. Scheduled via the existing maintenance queue at 08:30 / 12:30 / 17:30 UTC; per-platform daily caps (FB:3, Telegram:5, X:3) leave headroom under each API's free-tier ceiling. Platform adapters in `lib/social/` mirror the `JobSource` plugin pattern — one file per platform, env-gated via `SOCIAL_*_ENABLED` kill switches that default off. Curator scores candidates by recency + salary-present + description-length and round-robins by country.

- **2026-05-23:** Disk hit 82% on the shared box — root cause was Docker
  **build cache** (44 GB, never pruned), not data growth. RAM was healthy
  (~440 MB across all four containers, 4 GB free). Reclaimed ~45 GB
  (back to 22%) and added `docker builder prune -f --keep-storage 5GB` to
  `deploy.sh` so it self-maintains. Conclusion: **no spec upgrade needed**
  — current OVH VPS-1 has ample headroom; watch disk, not RAM.

- **2026-06-09:** **Migrated deploy off the self-managed OVH VPS onto a
  Coolify PaaS** (Traefik v3 proxy, auto-TLS) on a dedicated server.
  Platform contract: web binds `0.0.0.0:${PORT:-8080}` with no in-app TLS
  and no host ports (Traefik reaches it on the internal network; host port
  8000 reserved); dependency-free `GET /health` for the proxy probe
  (`/api/health` remains the DB+Redis-aware check); stateless with config
  100% via env. **Removed:** Caddy (`docker/Caddyfile`), the VPS prod stack
  (`docker/docker-compose.prod.yml` — Postgres/Redis/Caddy services + host
  ports), the `docker/postgres-init.d` app-user bootstrap, and
  `scripts/setup-app-user.sh`. **Dropped the `toplisters_app`/`toplisters`
  runtime-vs-owner role split** — Coolify's managed Postgres + Redis are
  external resources reached via `DATABASE_URL`/`REDIS_URL`, with a single
  role serving runtime + migrations (`MIGRATION_DATABASE_URL` optional).
  `prisma migrate deploy` now runs as a Coolify **pre-deploy** step, not in
  the web entrypoint. Web + worker images are multi-stage, non-root (`node`
  user), Next standalone. `deploy.sh` + `.github/workflows/deploy.yml` are
  deprecated (manual-only) and retained for the legacy box during cutover.
  `docker-compose.dev.yml` keeps Postgres/Redis for local dev only. Removed
  the temporary `ignoreBuildErrors`/`ignoreDuringBuilds` flags in
  `next.config.mjs` after fixing the type/lint errors they masked.
  **Also (product):** swapped the landing page — `/` now shows the latest
  jobs localized to the visitor's `CF-IPCountry` region (falling back to
  global), and the 3D globe moved to `/globe`.
  Note: the spec's "single OVHcloud VPS-1" deployment-target and budget
  sections above now describe the *legacy* box; the resource budgets still
  serve as sane guardrails on the new server.

## When in doubt

Ask. Specifically ask about anything that:
- Adds a new long-running process
- Adds a new external service dependency
- Changes resource consumption meaningfully
- Touches the deploy script or docker-compose.prod.yml
- Adds a new top-level directory
- Conflicts with this spec — surface the conflict, recommend, then wait

Default to the simplest thing that works, on the assumption that traffic is low
and the bottleneck is my time, not the server.
