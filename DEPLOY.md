# Deploying Toplisters on Coolify

Toplisters runs on a dedicated server managed by **Coolify** (Traefik v3
reverse proxy, automatic TLS). Deploys happen on **git-push to `main`** —
Coolify builds the images, runs the pre-deploy migration, and rolls the
containers. There is no `ssh + deploy.sh` step anymore (see
[Legacy VPS path](#legacy-vps-path-removed)).

This document is the deployment contract for the platform: exposed port,
environment variables, process types, scheduled tasks, external resources,
persistent paths, and the one-time Postgres data move.

---

## 1. Platform contract (what the app guarantees)

| Requirement | How Toplisters meets it |
|---|---|
| Listen on `0.0.0.0:${PORT:-8080}`, no TLS in app | `docker/Dockerfile.web` sets `HOSTNAME=0.0.0.0` + `PORT=8080`; Next standalone `server.js` binds them. TLS is terminated by Traefik. |
| No host `ports:` (proxy reaches the internal network; host port 8000 reserved) | `docker-compose.yml` uses `expose: ["8080"]`, never `ports:`. |
| `GET /health` → 200, no auth, no DB/Redis | [`app/health/route.ts`](app/health/route.ts) returns `{status:"ok"}` with zero dependency calls. (The dependency-aware probe is `/api/health`.) |
| Stateless; logs to stdout/stderr; no repo bind-mounts | No bind mounts; config + assets are baked into the image via `COPY`. Only writable path is the regeneratable banner cache (§7). |
| Migrations idempotent, run as a pre-deploy step | `prisma migrate deploy` (idempotent by design) as the Coolify pre-deploy command (§5), not in the web entrypoint. |
| Postgres/Redis are external Coolify resources | Reached only via `DATABASE_URL` / `REDIS_URL`. The app ships no DB/Redis services. |

**Exposed port:** `8080` (container, internal network only).
**Health path:** `/health`.
**Runs as:** unprivileged `node` user (both images).

---

## 2. Process types

Configure these as separate resources/commands in Coolify. All share the
same env (§4) and connect to the same external Postgres + Redis.

| Process | Image / command | Port | Notes |
|---|---|---|---|
| **web** | `docker/Dockerfile.web` → `node server.js` | 8080 | The Next.js site. Healthcheck `GET /health`. Scale horizontally as needed — it is stateless. |
| **worker** | `docker/Dockerfile.worker` → `npm run worker` | none | Long-running BullMQ consumer **and** scheduler. On boot it registers all recurring jobs (`registerSchedules()` in [`lib/jobs/scheduler.ts`](lib/jobs/scheduler.ts)). Run **exactly one** instance (BullMQ schedulers are idempotent on `upsertJobScheduler`, but a single worker keeps concurrency = 1 per source per the spec). |

> The worker is the scheduler. As long as one worker is running, every
> recurring task below fires on its own — **you do not need external cron**.
> §3 documents the cadence the worker uses, and the equivalent one-shot
> commands if you ever prefer to drive them from Coolify Scheduled Tasks
> instead.

---

## 3. Scheduled tasks (cadence)

These are registered inside the worker via BullMQ. Cadences come from
[`lib/jobs/scheduler.ts`](lib/jobs/scheduler.ts); per-source intervals are
overridable with `INTERVAL_MIN_<SOURCE>` env vars.

| Task | Cadence (UTC) | Worker job | Equivalent one-shot command |
|---|---|---|---|
| Aggregate each source | every 60–90 min, staggered | `aggregate:<source>` | `npm run source -- <source>` (runs the full fetch→normalize→geocode→dedupe→upsert pipeline once) or `npm run enqueue -- <source>` (hands one job to a running worker) |
| Mark stale jobs inactive | daily 03:15 | `maintenance:mark-stale` | `npm run enqueue -- mark-stale` |
| Email digests | daily 09:00 | `maintenance:send-digests` | `npm run send-digests` |
| Social auto-posting | 08:30, 12:30, 17:30 | `maintenance:post-to-social` | `npm run post-to-social` (`-- --dry` to preview) |

**If you instead run these as Coolify Scheduled Tasks** (one-shot containers
from the worker image, e.g. when running the worker without its internal
scheduler), use these cron expressions to match the above:

```
# every 90 min — aggregate (loop your enabled sources, or call the worker once)
*/90 * * * *   npm run source -- remoteok   # repeat per source, or script the loop
15 3   * * *   npm run enqueue -- mark-stale
0  9   * * *   npm run send-digests
30 8,12,17 * * * npm run post-to-social
```

Do **not** run both the internal worker scheduler *and* external cron for the
same task — pick one to avoid double-runs.

---

## 4. Environment variables

Config is 100% env. Nothing here is committed — `.env` / `.env*.local` are
gitignored; [`.env.example`](.env.example) is the authoritative template.
Set these in Coolify (the app's Environment Variables).

### Required

| Var | Purpose |
|---|---|
| `DATABASE_URL` | External Coolify Postgres connection string. Used by web, worker, and the pre-deploy migration. |
| `REDIS_URL` | External Coolify Redis. Append `/1` to pin DB index 1 (spec §1). |
| `PORT` | Web bind port. Defaults to `8080` if unset. |
| `NODE_ENV` | `production`. |
| `NEXT_PUBLIC_SITE_URL` | Canonical site origin, e.g. `https://toplisters.xyz`. **Also a build arg** (§6). |
| `ADMIN_USER`, `ADMIN_PASSWORD` | HTTP basic auth for `/admin/*` ([`middleware.ts`](middleware.ts)). |

### Optional — database

| Var | Purpose |
|---|---|
| `MIGRATION_DATABASE_URL` | Only if migrations should use a higher-privilege role than runtime. Falls back to `DATABASE_URL` ([`prisma.config.ts`](prisma.config.ts)). |

### Job sources

| Var | Purpose |
|---|---|
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Adzuna API creds. |
| `ADZUNA_COUNTRIES`, `ADZUNA_PAGES_PER_COUNTRY` | Adzuna tuning (defaults in `lib/sources/adzuna.ts`). |
| `DISABLE_ADZUNA_ENRICHMENT`, `ADZUNA_ENRICH_CAP` | Toggle/cap the per-job detail fetch. |
| `JOOBLE_API_KEY`, `JOOBLE_LOCATIONS` | Jooble creds + market list. |
| `REED_API_KEY`, `REED_MAX_RESULTS` | Reed creds + result cap. |
| `THE_MUSE_API_KEY`, `THE_MUSE_MAX_PAGES` | The Muse creds + page cap. |
| `FINDWORK_API_KEY`, `FINDWORK_MAX_PAGES` | Findwork creds + page cap. |
| `GREENHOUSE_COMPANIES`, `LEVER_COMPANIES`, `ASHBY_COMPANIES` | ATS board slugs/tokens (comma-sep). Ashby tokens are case-sensitive. |
| `DISABLE_SOURCE_*` | Per-source kill switches: `REMOTEOK`, `ARBEITNOW`, `REED`, `THE_MUSE`, `ADZUNA`, `JOOBLE`, `FINDWORK`, `GREENHOUSE`, `LEVER`, `ASHBY`, `REMOTIVE`, `JOURNALISMJOBS`, `DESIGNJOBSBOARD`. Set `"1"` to disable. |
| `INTERVAL_MIN_<SOURCE>` | Override a source's schedule interval in minutes. |

### External services

| Var | Purpose |
|---|---|
| `LOGO_DEV_PUBLISHABLE_KEY`, `LOGO_DEV_SECRET_KEY` | Logo.dev — company logos. |
| `RESEND_API_KEY`, `RESEND_FROM` | Resend transactional email. Blank `RESEND_API_KEY` ⇒ email no-ops. `RESEND_FROM` defaults to Resend's sandbox sender until your domain is verified. |
| `OUTREACH_FROM`, `INBOUND_DOMAIN`, `RESEND_WEBHOOK_SECRET` | Recruiter-outreach inbox (`/admin/inbox`). Send from `OUTREACH_FROM` (use a subdomain), receive replies via Resend Inbound → `/api/email/inbound`, routed by `reply+<token>@INBOUND_DOMAIN`. The webhook is **disabled until `RESEND_WEBHOOK_SECRET` is set** (fails closed). See "Recruiter inbox setup" below. |
| `IPAPI_KEY` | ipapi.co (works keyless on free tier). |

### Monitoring + analytics

| Var | Purpose |
|---|---|
| `SENTRY_DSN` | Error monitoring (optional). |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | PostHog. **Build args** (§6). |
| `NEXT_PUBLIC_GA_ID` | GA4 measurement id. **Build arg** (§6). |
| `NEXT_PUBLIC_CLARITY_ID` | Microsoft Clarity. **Build arg** (§6). |

### Salts

| Var | Purpose |
|---|---|
| `PAGEVIEW_SALT` | Daily-rotating visitor-hash salt ([`lib/pageviews.ts`](lib/pageviews.ts)). Set a private random string. |
| `IP_SALT` | IP-hash salt for the captcha/rate-limit ([`lib/captcha.ts`](lib/captcha.ts)). Falls back to `ADMIN_PASSWORD` then a dev default. |

### Read-only jobs API (`GET /api/v1/jobs`)

| Var | Purpose |
|---|---|
| `JOBS_API_KEYS` | Comma-separated plaintext API keys (zero-DB bootstrap). A request key is accepted if it matches one of these, or a non-revoked hashed key in the `api_keys` table (managed via `npm run apikey`). |
| `JOBS_API_RATE_LIMIT` | Per-key requests/minute (default 600). Fails open if Redis is down. |

The `api_keys` table ships in migration `20260616000000_add_api_keys`, applied
by the pre-deploy `prisma migrate deploy` (§5). See README → "Jobs API".

**UK Licensed-Sponsor enrichment (Task 8).** Migration
`20260623100000_add_sponsor_licence` adds the sponsor columns (auto-applied by
`prisma migrate deploy`). The worker schedules `refresh-sponsors` daily at 05:30
UTC (downloads the gov.uk register, tags every active GB employer). To populate
immediately after deploy without waiting for the schedule, run once:
`npm run sponsors:refresh` (add `-- --dry` to preview counts). No env/keys needed.

**Employer→ATS registry (direct-pull backbone).** Migration
`20260630100000_add_employer_ats_sources` adds `employer_ats_sources`. Grow it
with `npm run discover-ats -- "Company A, Company B" --save` — the direct-ATS
adapters (Greenhouse/Lever/Ashby/SmartRecruiters/Workday) then ingest those
boards automatically, no code change. To grow it **country by country, weakest
first**, run `npm run discover-country auto` — it takes the companies we only
get via aggregators in the least-covered countries and finds their direct
boards. (`… auto --countries 8`, or `… GB,IE,SG` for specific ones.) Track progress toward dropping aggregators
with `npm run direct-coverage` (direct-vs-aggregator share by country; ≥60% =
cut-ready). Pipeline precedence already prefers the direct link over an
aggregator wrapper.

**Company directory.** Migration `20260630000000_add_companies` adds the
`companies` table (auto-applied). The worker rebuilds it daily at 04:30 UTC from
active jobs; to populate immediately after an aggregation cycle, run
`npm run rebuild-companies`. Pages: `/companies` + `/company/<slug>`.

**Visa-pathway tags (Task 9).** Migration `20260623110000_add_visa_pathways`
adds `flexible_visa` + `visa_schemes` (auto-applied). The daily sponsor job
(05:30 UTC) also recomputes these afterwards. To populate immediately, run
`npm run visa-pathways:refresh` **after** `sponsors:refresh` (UK Scale-up /
Skilled Worker pathways read the licence data). The API computes the rich
`visa_pathways` array fresh on read; these columns only back the filters.

### Recruiter inbox setup (send + receive email)

Two-way email with recruiters, managed at `/admin/inbox` (behind admin basic-auth).
Tables ship in migration `20260623000000_add_email_inbox` (applied by `prisma
migrate deploy`). One-time operator setup:

1. **Sending** — verify a sending subdomain in Resend (e.g. `mail.toplisters.xyz`):
   add the DKIM/SPF records Resend shows, then set `OUTREACH_FROM="Toplisters
   <outreach@mail.toplisters.xyz>"`. Using a subdomain keeps cold-outreach
   reputation off the apex domain.
2. **Receiving** — in Resend, add a **receiving domain** (e.g. `inbound.toplisters.xyz`)
   and create the **MX** record it specifies. Set `INBOUND_DOMAIN="inbound.toplisters.xyz"`.
3. **Webhook** — in Resend → Webhooks, add an endpoint for `email.received` pointing
   at `https://toplisters.xyz/api/email/inbound`, and copy its **signing secret**
   into `RESEND_WEBHOOK_SECRET` (`whsec_…`). The webhook **fails closed** (503)
   until this is set, so set it last.
4. **Verify** — `/admin/inbox` → New outreach to a test address you control →
   reply → it threads back under the conversation within seconds.

Deliverability: keep daily volume modest, warm the subdomain, and include an
opt-out line in outreach (the compose form's default body is a starting point).
The exact inbound payload field names should be confirmed against the first real
inbound email; `app/api/email/inbound/route.ts` reads `text`/`html` defensively.

### Sports vertical (`sports.toplisters.xyz`)

Served from the **same** `web` container — `middleware.ts` rewrites the
`sports.*` host to the internal `/sports/*` route group. No new process, no
DB/Redis. The only backend piece is `/api/sports/roadmap`, which hides the
LLM key. All vars optional — the AI roadmap degrades gracefully when unset.

| Var | Purpose |
|---|---|
| `SPORTS_AI_PROVIDER` | `nvidia` (default) \| `groq` \| `gemini` \| `ollama`. |
| `SPORTS_AI_API_KEY` | Generic key override; else the provider's own var below. |
| `NVIDIA_KEY` / `GROQ_API_KEY` / `GEMINI_API_KEY` | Provider key (server-only). NVIDIA NIM is the free default. |
| `SPORTS_AI_MODEL`, `SPORTS_AI_BASE_URL` | Optional model / endpoint overrides. |
| `FOOTBALL_DATA_API_KEY` | World Cup live group standings (football-data.org free token). Blank ⇒ Elo projection. F1 needs no key (Jolpica). |
| `NEXT_PUBLIC_SPORTS_URL` | Sports origin for cross-vertical header links. **Build arg** (§6). |

**Operator step (DNS + Coolify):** add the domain `sports.toplisters.xyz` to
the existing Coolify `web` app (so Traefik routes it to the same container,
under the wildcard `*.toplisters.xyz` TLS) and add the DNS record. No second
app/deploy. **Data step:** update group results in
`lib/sports/worldcup/teams.ts` as the World Cup progresses (see README).

### Social auto-posting (all default off)

| Var | Purpose |
|---|---|
| `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `SOCIAL_FACEBOOK_ENABLED`, `SOCIAL_FACEBOOK_DAILY_CAP` | Facebook Page (cap default 3). |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `SOCIAL_TELEGRAM_ENABLED`, `SOCIAL_TELEGRAM_DAILY_CAP` | Telegram channel (cap default 5). |
| `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`, `SOCIAL_TWITTER_ENABLED`, `SOCIAL_TWITTER_DAILY_CAP` | X/Twitter (cap default 3). |

### Ads (disabled — compliance)

AdSense is **off** per the job-API ToS (see `info/COMPLIANCE.md`). Leave these
blank / `0`: `NEXT_PUBLIC_ADS_ENABLED`, `NEXT_PUBLIC_ADSENSE_CLIENT`,
`NEXT_PUBLIC_ADSENSE_SLOT_LIST`, `NEXT_PUBLIC_ADSENSE_SLOT_DETAIL`.

---

## 5. Migrations (pre-deploy command)

`prisma migrate deploy` only applies already-generated migrations and is
idempotent (re-running a fully-migrated DB is a no-op), so it is safe as a
pre-deploy step and never races the web entrypoint.

**Coolify → web resource → Pre-deploy command:**

```sh
npx prisma migrate deploy
```

It runs inside the web image, which ships the Prisma schema, generated
client, and CLI. It reads `MIGRATION_DATABASE_URL` if set, else `DATABASE_URL`
(via [`prisma.config.ts`](prisma.config.ts)).

> The old `toplisters_app` / `toplisters` runtime-vs-owner role split and the
> `docker/postgres-init.d` bootstrap were **removed** in this migration. Coolify's
> managed Postgres provides a single role that serves both runtime queries and
> migrations. If you want least-privilege role separation later, create a
> restricted runtime role in the managed DB and point `DATABASE_URL` at it
> while `MIGRATION_DATABASE_URL` keeps the owner role.

---

## 6. Build-time args (NEXT_PUBLIC_*)

`NEXT_PUBLIC_*` values are **inlined into the client bundle at `next build`**,
so they must be present as Docker **build args** — runtime env is too late for
anything baked into client JS. Coolify forwards build-time env to the build;
`docker-compose.yml` maps these into the web build:

```
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SPORTS_URL
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST
NEXT_PUBLIC_GA_ID
NEXT_PUBLIC_CLARITY_ID
```

Set them as build-time variables in Coolify (they can also be regular env for
the running container — they're just additionally needed at build).

---

## 7. Persistent paths

The app is **effectively stateless**. The only thing it writes to disk is a
**regeneratable banner cache**:

| Path | Contents | Volume needed? |
|---|---|---|
| `/app/public/banners/<hash>.jpg` | Per-company hero banners, lazily generated by Sharp ([`lib/banners/generate.ts`](lib/banners/generate.ts)) and served from `public/`. | **Optional.** They regenerate on demand, so losing them on redeploy only causes lazy re-generation (a brief CPU cost). Mount a persistent volume at `/app/public/banners` if you want to avoid the regeneration churn across deploys. |

Everything else (Postgres dumps, GeoNames, etc.) lives in the external
Postgres or in object storage (Backblaze B2 for backups, per spec §2). **No
other host path is written.** If you mount nothing, the app is fully stateless.

---

## 8. External resources

Create these as Coolify-managed resources and wire their connection strings
into `DATABASE_URL` / `REDIS_URL`:

- **Postgres 16** — the job catalogue + analytics. Reached via `DATABASE_URL`.
- **Redis 7** — BullMQ queues + cache. Reached via `REDIS_URL` (pin DB index 1
  with a trailing `/1`).

Neither is shipped by this repo.

---

## 9. One-time data move (old VPS → Coolify Postgres)

Note for the infra team. The legacy Postgres ran in the `toplisters-postgres`
container on internal port **5433**, database `toplisters`, owner role
`toplisters`. `$NEW_DATABASE_URL` below is the Coolify-managed Postgres
connection string (the same value you'll set as `DATABASE_URL`).

```sh
# 1) On the OLD VPS — dump in custom format (compressed, restore-flexible).
docker exec -t toplisters-postgres \
  pg_dump -U toplisters -p 5433 -d toplisters -Fc -f /tmp/toplisters.dump
docker cp toplisters-postgres:/tmp/toplisters.dump ./toplisters.dump

# 2) Copy ./toplisters.dump to a host that can reach the new Coolify Postgres.

# 3) Restore into the NEW Coolify Postgres. --no-owner/--no-privileges drop the
#    old toplisters/toplisters_app role grants (the managed DB has its own role);
#    --clean --if-exists makes the restore re-runnable.
pg_restore --no-owner --no-privileges --clean --if-exists \
  -d "$NEW_DATABASE_URL" toplisters.dump

# 4) Sanity check.
psql "$NEW_DATABASE_URL" -c "SELECT count(*) FROM jobs;"
```

Then run `npx prisma migrate deploy` against `$NEW_DATABASE_URL` (the
pre-deploy step does this automatically on first deploy) to ensure the schema
is at head, and verify `/api/health` returns `200`.

If you prefer plain SQL over custom format:

```sh
docker exec -t toplisters-postgres \
  pg_dump -U toplisters -p 5433 -d toplisters --no-owner --no-privileges \
  | gzip > toplisters.sql.gz
gunzip -c toplisters.sql.gz | psql "$NEW_DATABASE_URL"
```

---

## Legacy VPS path (removed)

The previous deploy path — `deploy.sh` (git pull → build → migrate → roll
containers) driven by `.github/workflows/deploy.yml` over SSH, with **Caddy**
terminating TLS and **Postgres/Redis** as compose services in
`docker/docker-compose.prod.yml` — is **no longer used**. Coolify git-push
replaces all of it.

Removed in this migration: `docker/Caddyfile`, `docker/docker-compose.prod.yml`,
`docker/postgres-init.d/`, `scripts/setup-app-user.sh`. The
`.github/workflows/deploy.yml` push trigger was disabled (manual-only) and
`deploy.sh` carries a deprecation banner — both retained only for emergency
use against the legacy box during cutover. **Delete them once the OVH VPS is
decommissioned.**

Local development still uses `docker-compose.dev.yml` for Postgres + Redis
(loopback-only ports); it is never deployed.

---

## Self-check

- [x] App listens on `0.0.0.0:$PORT` (8080), no TLS in app
- [x] No host `ports:` — `expose:` only
- [x] Config 100% via env; `.env` gitignored, no secrets committed
- [x] `GET /health` → 200 with no DB/Redis access
- [x] No repo bind-mounts; assets baked into the image
- [x] Migrations idempotent, run as a pre-deploy step
- [x] Worker + scheduled tasks declared (§2, §3)
- [x] External Postgres/Redis via env (§8)
- [x] Persistent paths identified (§7 — banner cache only; otherwise stateless)
