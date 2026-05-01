# Project: Toplisters.xyz — Location-Based Job Listing Platform

I'm building a job listing platform at **toplisters.xyz**. Before writing any code, I want you to:

1. Read this entire spec end-to-end
2. Ask me clarifying questions about anything ambiguous
3. Confirm the folder structure you'll use
4. Confirm the Phase 1 scope
5. **Wait for my explicit approval** before scaffolding anything

Once approved, build incrementally — one feature at a time, pause for me to test after each. Do not generate dozens of files in one shot.

---

## Product Vision

A globally-aware job board with a **Radio Garden-style interactive 3D globe** as the primary discovery interface. Users land on a globe; zooming or clicking a region reveals job clusters. Default behavior: detect user's location via IP and auto-rotate the globe to that region. Covers both **blue-collar and white-collar** roles. Job posting is **free** for employers. Future monetization via Google AdSense + sponsored/featured listings.

---

## Locked Tech Stack (do not suggest alternatives unless you spot a real blocker)

- **Next.js 14 App Router + TypeScript** — single repo, frontend + API routes
- **Tailwind CSS + shadcn/ui** — no custom CSS systems
- **PostgreSQL 16** — no PostGIS; use lat/lng floats with bounding-box queries
- **Prisma ORM**
- **Redis + BullMQ** — caching and job queues
- **Postgres full-text search** (`tsvector`) — no Elasticsearch/Meilisearch
- **Globe.gl** — for the 3D globe (not raw Three.js)
- **Recharts** — for analytics charts
- **node-vibrant** — logo color extraction
- **Logo.dev API** — company logos (free tier), fallback to generated initials avatar
- **Self-hosted GeoNames cities database** — for geocoding (no external geocoding API)
- **Caddy** — reverse proxy with auto-HTTPS
- **Docker Compose** — local dev and production
- **Single Hetzner VPS** (CX22 or CX32) for production deployment
- **Cloudflare** free tier — CDN/DDoS in front
- **Resend** — transactional email (free tier)
- **Sentry** + **PostHog** — monitoring (free tiers)
- **sharp** or **@vercel/og** — for OG image generation

---

## Job Aggregation Sources (all free tiers initially)

Build source adapters using a plugin pattern. Each source = a class implementing a `JobSource` interface with `fetch()` and `normalize()` methods. Adding a new source = adding one new file.

- **Adzuna** — free tier, conservative usage, cache aggressively. **Important**: read their TOS, respect rate limits, and acknowledge attribution requirements (Adzuna-sourced jobs should display "via Adzuna" near the listing).
- **Jooble** — free with API key
- **Reed.co.uk** — free, UK focus
- **The Muse** — free, US white-collar
- **Arbeitnow** — free, Europe
- **RemoteOK** — free, remote
- **Findwork.dev** — free tier, tech

Implement: per-source rate limit configs in env vars, exponential backoff on 429s, per-source quota tracking in Redis, and a kill-switch env var to disable any source quickly.

---

## Geocoding Strategy (Boring & Free)

No external geocoding API. Strategy:

1. On initial setup, download GeoNames `cities500.zip` from geonames.org (~200k cities)
2. Seed into a `cities` table with indexes on `(country_code, name)` and `(country_code, admin1_code, name)`
3. For each incoming job, parse location text into `{city, region, country}` with a simple parser
4. Lookup priority: `city + country` → `region + country` → country centroid
5. Add ±0.05° random jitter (~5km) to lat/lng so jobs in the same city don't visually overlap on the globe
6. Cache lookups in a `geocode_cache` table keyed on the raw location string

Provide a `scripts/seed-geonames.ts` that downloads and seeds the data.

---

## Unified Job Schema

```
id (cuid)
source (string)
source_id (string, unique-with-source)
title (string)
company_name (string)
company_domain (string, nullable)
location_text (string)
country_code (string, ISO-2)
region (string, nullable)
city (string, nullable)
lat (float)
lng (float)
apply_url (string)
description_html (text, sanitized)
description_text (text, plain)
posted_date (datetime)
closing_date (datetime, nullable)
last_seen_at (datetime)
salary_min (int, nullable)
salary_max (int, nullable)
salary_currency (string, nullable)
salary_period (enum: hourly|daily|monthly|yearly, nullable)
job_type (enum: full_time|part_time|contract|temp|internship)
work_mode (enum: remote|hybrid|onsite|unknown)
experience_level (enum: entry|mid|senior|exec|unknown)
category (string)
collar_type (enum: blue|white|grey|unknown)
skills (string[])
benefits (string[])
visa_sponsorship (bool, nullable)
is_user_submitted (bool, default false)
submitted_by_email (string, nullable)
moderation_status (enum: approved|pending|rejected, default approved for API jobs)
is_featured (bool, default false)
view_count (int, default 0)
click_count (int, default 0)
is_active (bool, default true)
dedupe_hash (string, indexed)
created_at (datetime)
updated_at (datetime)
```

**Dedupe hash**: SHA1 of `lower(title) + "|" + lower(company_name) + "|" + country_code + "|" + (city || "")`. Skip insert if hash exists.

**Inactive marking**: jobs not seen in 30 days → set `is_active = false`. Don't hard-delete (preserves analytics history).

---

## Core Features — Phase 1 (MVP)

### 1. Job Aggregation Worker
- BullMQ repeatable jobs, one per source, staggered intervals
- Normalize via the `JobSource` interface
- Dedupe by hash
- Geocode using local GeoNames lookup
- Mark stale jobs inactive

### 2. Globe Discovery (Landing Page `/`)
- Globe.gl with point markers per job location
- Simple grid-based clustering at low zoom (skip Supercluster for MVP)
- Click marker/region → slide-in panel listing jobs there
- IP geolocation via `ipapi.co` free tier on first visit → auto-rotate to user's country
- "Use my location" button for browser geolocation
- Performance: cap rendered points at ~5000, cluster the rest

### 3. Job Listing Page (`/jobs`)
- Grid of cards showing **only company logo** (subtle hover reveals title + location)
- Filters sidebar: country, city, category, collar_type, work_mode, salary range, job_type
- Search bar (Postgres FTS via `tsvector` GIN index)
- Pagination (offset-based, 24 per page)

### 4. Job Detail Page (`/jobs/[id]/[slug]`)
- **Hero banner**: company logo centered, landscape (1200×400), background = dominant color extracted from logo via `node-vibrant`. Generate once, save to `/public/banners/[hash].jpg` via `sharp`, serve as static file.
- Logo source: Logo.dev → fallback to deterministic initials avatar (color from hash of company name)
- All job fields displayed
- "Apply Now" button → POST to `/api/jobs/[id]/click` → records in `job_clicks` table → 302 redirect to `apply_url`
- "Similar jobs" section (same category + same/nearby country)
- **JSON-LD JobPosting** structured data (essential for Google Jobs)

### 5. Free Job Posting (`/post-a-job`)
- Form, no account required
- Magic-link email confirmation via Resend before publication
- Schema-matched fields, `is_user_submitted = true`, `moderation_status = pending`
- Honeypot field + simple math captcha (no reCAPTCHA dependency)
- Admin moderation queue at `/admin/queue` (HTTP basic auth via env credentials)

### 6. Location Landing Pages (`/jobs/[country]/[city]`)
- SEO-critical pages: `/jobs/uk/coventry`, `/jobs/uk/manchester`, `/jobs/us/new-york`, etc.
- Each has unique stats (job count, top categories, avg salary), filtered job list, and a small unique copy block
- Auto-generated for any city with ≥5 active jobs
- Listed in sitemap

### 7. Analytics Dashboard (`/analytics`, public)
- Total active jobs counter
- Jobs by country (Recharts bar chart)
- Jobs by category (bar)
- Top hiring companies (leaderboard)
- Posting trends over last 90 days (line chart)
- Trending skills (top 20 from skills array)
- Date range filter, country filter
- Aggregates pre-computed every 15 min, cached in Redis

### 8. SEO Foundation
- Dynamic `sitemap.xml` with all active jobs + location landing pages
- `robots.txt`
- JSON-LD `JobPosting` on every job page
- JSON-LD `Organization` on About page (with `parentOrganization` → Ainika)
- OG images per job via `sharp` or `@vercel/og`
- Canonical tags
- Meta descriptions auto-generated from job description (first 155 chars)

### 9. Monetization Hooks (Reserved, Not Active)
- `<AdSlot>` React components placed in layout: header, between-cards (every 6th card), sidebar, in-article
- Renders `null` for now, single env flag flips them on
- `is_featured` flag in schema with ranking boost in queries (no UI to set yet — admin can flip in DB)

---

## Owned-Network Cross-Linking

Implement in a single config file `lib/network-links.ts` so it's easy to adjust later.

### Footer (every page, single line)
- "Built by [Ainika](https://ainika.xyz) · Developed by [Lyrava](https://lyrava.com)"
- `rel="noopener"` only (NOT `nofollow` — these are legitimate attributions)
- Small, secondary footer area

### About Page (`/about`)
- Natural prose: "Toplisters.xyz is a product by [Ainika](https://ainika.xyz), developed and maintained by [Lyrava](https://lyrava.com)."
- Brand-name anchors only — no keyword stuffing
- Add `Organization` JSON-LD with `parentOrganization` → Ainika

### Post a Job page (`/post-a-job`)
- Single sidebar callout: "Building your own careers page? [Lyrava](https://lyrava.com) builds custom job boards and company websites."
- Only on this page

### Employer Resources page (`/employer-resources`) — Phase 2, conditional
- Build only if it can be filled with at least 5–10 genuinely useful third-party resources
- If included, h360.uk sits naturally under an "Office services" category alongside other non-owned listings
- Skip if it would feel like a link dump

### Enforce in code review
- ❌ No link block in main footer with all three site names
- ❌ No "Our other sites" sidebar widget
- ❌ No keyword-rich anchor text — brand names only
- ❌ Maximum one link per page to any owned site (About page can have two for context)

---

## Deployment

Single Hetzner VPS. Provide:

- `docker-compose.yml` with services: `web` (Next.js), `worker` (BullMQ), `postgres`, `redis`, `caddy`
- `Caddyfile` with auto-HTTPS for `toplisters.xyz` + `www.toplisters.xyz`
- `deploy.sh` script: pulls latest code, runs migrations, rebuilds containers, zero-downtime restart
- `.env.example` with all required env vars documented
- `README.md` with setup, dev, and deploy instructions
- Daily Postgres backup script to Backblaze B2 (or local fallback)

Cloudflare sits in front of the VPS for CDN + DDoS (configured manually, not in code).

---

## Folder Structure (confirm before scaffolding)

Propose a clean Next.js App Router structure with:
- `/app` for routes (including grouped routes for `(public)`, `(admin)`)
- `/lib` for shared utilities (db client, redis client, network-links config, geocoding, logo extraction)
- `/lib/sources` for the JobSource adapters (one file per source)
- `/lib/jobs` for BullMQ worker definitions
- `/components` for shared React components
- `/components/ui` for shadcn components
- `/prisma` for schema and migrations
- `/scripts` for one-off scripts (geonames seed, backfills)
- `/docker` for Dockerfiles and Caddyfile
- `/public` for static assets (including generated banners and OG images)

---

## Phased Plan

**Phase 1 — MVP (~2 weeks)**
- Aggregation pipeline with 3 sources (Adzuna + Jooble + RemoteOK)
- GeoNames seeding + geocoding
- Job listing + detail pages with logo banners
- Basic globe view with clustering
- Location landing pages
- JSON-LD + sitemap + SEO foundation
- Footer + About network links

**Phase 2 (~2 more weeks)**
- Free job posting + moderation queue
- Analytics dashboard
- Remaining job sources (Reed, The Muse, Arbeitnow, Findwork.dev)
- Email alerts (basic: subscribe by country/category)
- Employer resources page (if viable)

**Phase 3 (post-launch)**
- AdSense activation (once traffic justifies it)
- Sponsored/featured listings UI + payment
- Saved searches
- Employer accounts with dashboards
- Advanced filters
- Mobile app PWA polish

---

## Constraints & Principles

- **Boring stack** — no exotic dependencies, no clever abstractions. Future-me should be able to pick this up after 6 months away.
- **Single VPS deployable** — entire stack runs on one ~$5/month Hetzner CX22 for MVP
- **API costs $0/month at start** — only free tiers
- **TOS-compliant** — particularly Adzuna's attribution and rate limits
- **SEO-first architecture** — SSR everything, structured data everywhere, fast pages
- **No premature optimization** — Postgres FTS is fine, don't reach for Elasticsearch; offset pagination is fine, don't reach for cursor-based until you need it

---

## What I Want You To Do Now

1. Ask me clarifying questions on anything ambiguous (especially: do I have API keys yet, my deployment experience level, whether I want CI/CD set up from day one, target launch date)
2. Confirm the folder structure
3. Confirm Phase 1 scope and the order you'd build features in
4. Flag any risks or contradictions you see in this spec
5. **Wait for my explicit approval** before generating any code

When I approve, build Phase 1 incrementally — one feature at a time — and pause for me to test after each.
