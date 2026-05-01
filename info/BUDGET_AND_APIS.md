# Toplisters.xyz — Budget & APIs Reference

Companion doc to `PROJECT_SPEC.md`. Keep this for ongoing reference.

---

## Monthly Budget Tiers

### Tier 1: Lean MVP (~$7–10/month)
Start here. Matches realistic early-stage ad revenue.

| Item | Cost |
|---|---|
| Domain (toplisters.xyz) | ~$1/month amortized |
| Hetzner CX22 VPS (4GB RAM, hosts everything) | ~$5/month |
| Postgres on same VPS | $0 |
| Redis on same VPS | $0 |
| Cloudflare (CDN, DNS, DDoS) | $0 |
| Logo.dev free tier (5k logos/month) | $0 |
| Self-hosted GeoNames lookups | $0 |
| Job APIs (free tiers) | $0 |
| Sentry free tier | $0 |
| PostHog free tier (1M events) | $0 |
| Email (Resend free: 3k/month) | $0 |
| Backups to Backblaze B2 | ~$1/month |
| **Total** | **~$7–10/month** |

### Tier 2: Growth (~$50–100/month)
When you hit ~5k visitors/day. Add managed Postgres, better Logo.dev tier, paid geocoding fallback if needed.

### Tier 3: Scale (~$300–800/month)
When monetization works. This is when Adzuna's commercial tier or a custom partnership becomes worth pursuing.

---

## Job APIs

### Primary (Free Tiers)
- **Adzuna** — Global, generous free tier for personal use. Commercial use requires negotiation; their public commercial pricing starts around £2,860/month so you'll want to email partnerships directly if you want to scale beyond the free tier. **TOS notes**: must attribute Adzuna, must not aggregate with other sources without consent, must not contact their third-party content providers directly.
- **Jooble** — Free with API key request. Good international coverage.
- **Reed.co.uk** — Free, UK-focused. Highly relevant for your Coventry base.
- **The Muse** — Free, US white-collar.
- **Arbeitnow** — Free, Europe-focused.
- **RemoteOK** — Free, remote jobs.
- **Findwork.dev** — Free tier, tech jobs.

### Per-Company Direct
- **Greenhouse / Lever / Workable** — These are per-company ATS APIs. Public job boards are often free to query without auth. Add the biggest companies in your region individually.

### Avoid
- **LinkedIn / Indeed** — Heavily restrict scraping and API access. Do not attempt without an official partnership.

---

## Other APIs Used

| Service | Purpose | Free Tier |
|---|---|---|
| Logo.dev | Company logos by domain | 5k/month |
| ipapi.co | IP geolocation for default user location | 1k/day |
| Resend | Transactional email (magic links, alerts) | 3k/month |
| Sentry | Error monitoring | 5k errors/month |
| PostHog | Product analytics | 1M events/month |
| Cloudflare | CDN, DNS, DDoS protection | Generous free tier |

---

## Geocoding (Self-Hosted, $0)

Skip external geocoding APIs entirely. Use GeoNames `cities500.zip`:
- Download once from https://download.geonames.org/export/dump/
- ~200k cities with lat/lng/country/admin1
- Load into Postgres `cities` table
- Lookup priority: `city + country` → `region + country` → country centroid
- Add ±0.05° random jitter to prevent globe overlap

---

## Revenue Expectations (Honest)

Based on prior experience running jobtoplisters.com (India) earning ~$10/month from AdSense:

- **UK/global traffic** typically pays 5–10x more per click than India traffic
- Same traffic could realistically yield $50–100/month in mature markets
- **Custom sponsored listings** are the real opportunity: even one £50/month featured listing beats months of AdSense
- **Featured job boost** (free posting, pay to feature) is the proven path: £10–20 per featured listing for 30 days
- Expect 6–12 months break-even or slightly negative before self-sustaining

---

## SEO Priorities (Ranked by Impact)

1. **JSON-LD JobPosting schema** on every job page → gets you into Google for Jobs widget
2. **Submit sitemap to Google Search Console** → indexing speed
3. **Location landing pages** (`/jobs/uk/coventry`, etc.) → rank for "[city] jobs" searches
4. **Page speed** (single VPS + Caddy + Cloudflare gets you most of the way)
5. **Fresh content signal** from frequently-updated listings
6. **Real outreach** — guest posts, university career page mentions, local news. One `.edu` link beats 100 footer links.

Network backlinks (ainika.xyz, lyrava.com, h360.uk) are a **brand cohesion play, not an SEO strategy**. Don't over-rely on them.
