# Toplisters.xyz

Location-based job board with a 3D globe at the centre. Aggregates roles
from free public job APIs, free posting for employers, monetised later
via AdSense + featured listings.

A product by [Ainika](https://ainika.xyz), developed and maintained by
[Lyrava](https://lyrava.com). Full spec lives at
[`info/PROJECT_SPEC.md`](info/PROJECT_SPEC.md);
budget + API notes at [`info/BUDGET_AND_APIS.md`](info/BUDGET_AND_APIS.md).

## Stack

| Layer | Tool |
|---|---|
| Web framework | Next.js 14 App Router + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui (Base UI primitives) |
| Database | PostgreSQL 16 + Prisma 7 (with `@prisma/adapter-pg`) |
| Cache + queues | Redis 7 + BullMQ |
| 3D globe | Globe.gl |
| Charts | Recharts |
| Search | Postgres FTS (generated `tsvector` + GIN index) |
| Logos | Logo.dev brand search → `img.logo.dev` |
| Email | Resend (magic-link + admin notifications) |
| Reverse proxy | Caddy (auto-HTTPS via Let's Encrypt) |
| Analytics | PostHog + Google Analytics 4 (opt-in) |
| Backups | Backblaze B2 via `rclone` |
| Hosting | Single VPS / dedicated, Docker Compose stack |

## Routes

| URL | What |
|---|---|
| `/` | 3D globe — every active role plotted as a city cluster |
| `/jobs` | Filtered listing (search, country, category, work mode, salary) |
| `/jobs/locations` | Browse-by-location directory |
| `/jobs/[country]` | Country index → cities |
| `/jobs/[country]/[city]` | City landing page (≥5 jobs) |
| `/job/[id]/[slug]` | Detail page with JSON-LD + click tracking |
| `/post-a-job` | Free posting form with magic-link confirmation |
| `/post-a-job/sent` / `/confirmed` | Status pages |
| `/admin/queue` | Moderation queue (HTTP basic auth) |
| `/analytics` | Public live stats |
| `/about` | Spec attribution + scope |
| `/privacy` | Privacy notice + cookie controls |
| `/sitemap.xml`, `/robots.txt` | SEO |
| `/api/jobs/[id]/click` | POST → click record + 303 to apply URL |
| `/api/jobs/submit` | POST → user-submitted jobs |
| `/api/jobs/submit/confirm` | GET → magic-link confirmation |
| `/api/geoip` | Cookie-cached ipapi.co wrapper |

## Local development

Prereqs: Node 20+, Docker (or Colima), npm.

```bash
# 1. Install
npm install

# 2. Env
cp .env.example .env.local
cp .env.example .env          # Prisma CLI reads this

# 3. Postgres + Redis
docker compose up -d

# 4. Apply migrations + seed cities
npx prisma migrate dev
npm run seed:geonames         # ~12 MB download, ~232k city rows

# 5. Run the app
npm run dev                   # http://localhost:3000
```

### Aggregator (optional, populates jobs)

```bash
# One-shot a single source
npm run source -- remoteok
npm run source -- arbeitnow
npm run source -- reed         # needs REED_API_KEY in .env

# Run the BullMQ worker on the production schedule
npm run worker

# Or run all enabled sources once and exit (good for CI / cron)
npm run worker -- --once

# Manually trigger a queued job while the worker is running
npm run enqueue -- remoteok
npm run enqueue -- mark-stale
```

### Useful CLI

| Command | What |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (don't run alongside `npm run dev` — trashes `.next/`) |
| `npm run lint` | ESLint |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:studio` | Prisma Studio at `:5555` |
| `npm run db:generate` | Regenerate the Prisma client |

## Production deploy

### What's deployed

The `docker/docker-compose.prod.yml` brings up five services on one box:

| Service | Image | Notes |
|---|---|---|
| `caddy` | `caddy:2-alpine` | TLS termination + reverse proxy. Only service exposing ports (80/443). |
| `web` | built from `docker/Dockerfile.web` | Next.js standalone runtime |
| `worker` | built from `docker/Dockerfile.worker` | BullMQ aggregator + maintenance |
| `postgres` | `postgres:16-alpine` | Private, persisted volume |
| `redis` | `redis:7-alpine` | Private, persisted volume |

### One-time server setup

On a fresh Debian 13 box (Hetzner, OVH, etc.):

```bash
# Update + install Docker, git, curl, ufw, fail2ban
ssh root@your-server
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin git curl ufw fail2ban unattended-upgrades

# Firewall: allow SSH + 80 + 443
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Create deploy user + clone repo
adduser --disabled-password --gecos '' deploy
usermod -aG docker deploy
mkdir -p /srv/toplisters && chown deploy:deploy /srv/toplisters

su - deploy
cd /srv
git clone https://github.com/ainikaventures/toplisters.git
cd toplisters

# Create .env (NOT committed). Fill from .env.example + add a strong
# POSTGRES_PASSWORD. Keep it 0600.
cp .env.example .env && chmod 600 .env
nano .env

# First deploy
./deploy.sh
```

DNS: point `toplisters.xyz` and `www.toplisters.xyz` A-records at the
server IP (or use Cloudflare proxied — Caddy will still get its TLS cert
via HTTP-01 if you set Cloudflare to "DNS only" for the cert challenge).

### Subsequent deploys

Two ways:

**Manual** (anyone with SSH access):

```bash
ssh deploy@server "/srv/toplisters/deploy.sh"
```

**Automatic via GitHub Actions** (push to main → live in ~60s):

1. Add these repo secrets (Settings → Secrets and variables → Actions):
   - `PROD_HOST` — server IP or hostname
   - `PROD_USER` — `deploy`
   - `PROD_SSH_KEY` — private key matching `~/.ssh/authorized_keys` on server
   - `PROD_SSH_PORT` — (optional, default `22`)
2. Uncomment the `push:` trigger in
   [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

`deploy.sh` is idempotent and runs:
git pull → build → migrate → roll containers → health check.

### Backups

Daily Postgres dumps to Backblaze B2 via `rclone`:

```bash
# On the host
apt install -y rclone
rclone config       # add a remote called "b2"

# Add to /srv/toplisters/.env:
#   BACKUP_BUCKET=toplisters-backups
#   BACKUP_PREFIX=postgres

# Schedule daily at 03:15 UTC
crontab -e
# Add:
15 3 * * * /srv/toplisters/scripts/backup-postgres.sh >> /var/log/toplisters-backup.log 2>&1
```

Local copies are kept for 7 days as a fallback. See
[`scripts/backup-postgres.sh`](scripts/backup-postgres.sh) for the full
script.

### Operations

| Task | Command |
|---|---|
| Live logs | `docker compose -f docker/docker-compose.prod.yml logs -f web worker` |
| Restart web only | `docker compose -f docker/docker-compose.prod.yml restart web` |
| Roll back to a previous commit | `git reset --hard <sha> && ./deploy.sh` |
| Run a one-off psql session | `docker exec -it toplisters-postgres psql -U toplisters` |
| Run a one-off Redis CLI | `docker exec -it toplisters-redis redis-cli` |
| Trigger an aggregator now | `docker exec toplisters-worker npm run enqueue -- remoteok` |
| Restore a backup | `gunzip < dump.sql.gz \| docker exec -i toplisters-postgres psql -U toplisters` |

### Hosting more sites on the same box

The architecture is designed for it. To add another site:

1. Clone the second repo to `/srv/<site>/`.
2. Give it its own `.env` and `docker/docker-compose.prod.yml`.
3. Add a hostname block to `docker/Caddyfile` (the toplisters Caddy
   instance can reverse-proxy to multiple internal services).
4. Either point Caddy at a shared Postgres + Redis (one instance,
   per-site database) or run separate ones inside the second compose
   project. The shared model is cheaper RAM-wise; per-site gives
   stronger isolation.
5. Run that site's `deploy.sh`. Caddy provisions a separate TLS cert
   per hostname automatically.

Full multi-site Caddyfile + per-site deploy template lands when the
second site is migrated.

## Adding a job source

Each source is one file in [`lib/sources/`](lib/sources/) implementing
the `JobSource` interface. Pattern:

```ts
class MySource implements JobSource {
  readonly name = "myname";
  readonly displayName = "MyName";
  readonly attribution?: string;     // for sources that require it (e.g. Adzuna)

  isEnabled(): boolean {
    return process.env.DISABLE_SOURCE_MYNAME !== "1";
  }
  async fetch(): Promise<unknown> { /* return raw API payload */ }
  normalize(raw: unknown): NormalizedJob[] { /* map to our schema */ }
}
```

Then register in [`lib/sources/index.ts`](lib/sources/index.ts) and the
worker schedule in [`lib/jobs/scheduler.ts`](lib/jobs/scheduler.ts).
The pipeline (`runAggregation`) handles geocoding, logo resolution,
dedupe, and upserts.

## Environment variables

See [`.env.example`](.env.example) — annotated with where to sign up for
each service and which keys are public-safe vs server-only.

## License

Proprietary — all rights reserved. Source-available for review; not for
redistribution.
