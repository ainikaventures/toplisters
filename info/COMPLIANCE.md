# Data-source compliance

How Toplisters stays within its job-data providers' terms. This is an
engineering record, not legal advice — re-read each provider's current
terms before scaling, and especially before re-enabling ads.

_Last reviewed: 2026-05-23._

## Posture (the load-bearing decisions)

- **No ads / non-commercial.** AdSense is hard-disabled site-wide
  (`components/ads/AdsLoader.tsx` + `AdSlot.tsx` force `enabled = false`,
  and the `google-adsense-account` ownership meta is removed from
  `app/layout.tsx`). Most of the free-tier job APIs we use permit
  **personal / non-commercial** use only; running ads would put us in
  breach. Re-enabling ads is therefore a **terms-review trigger**, not a
  config flip — see "Re-enabling ads" below.
- **Official APIs only.** Every source is an official REST API or a
  public ATS board endpoint. No scraping behind logins. LinkedIn and
  Indeed are deliberately not integrated (they restrict scraping/API
  access — see `info/BUDGET_AND_APIS.md`).
- **Link out, never clone.** "Apply" goes through
  `/api/jobs/[id]/click` → 303 redirect to the original `applyUrl`,
  unmodified, preserving each provider's affiliate / tracking params.
- **Attribution shown.** Every adapter sets a `JobSource.attribution`
  ("via X") rendered next to Apply on the job detail page and on
  `/sources`.
- **Bounded retention.** Jobs not re-seen for 30 days are set
  `isActive=false` (`lib/jobs/stale.ts`); soft-delete keeps analytics.
- **Per-source kill-switch.** `DISABLE_SOURCE_<NAME>=1` disables any
  source instantly without a deploy.

## Per-provider

| Provider | Access | Attribution | Notes |
|---|---|---|---|
| **Adzuna** | Official API (`app_id`/`app_key`) | via Adzuna | TOS requires attribution (done), apply via `redirect_url` unmodified (done), no salary-prediction misrepresentation (done). Their terms also note **personal use only** and **no aggregating with other sources without consent** — the no-ads stance addresses the commercial concern; the no-aggregation clause remains a known risk to watch. Free tier 1000 req/day, we use ~29%. |
| **Reed** | Official API (Basic auth) | via Reed | Attribution + link-back required (done). Appcast syndicator rows filtered at ingest (`reed.ts`) + historic cleanup (`scripts/deactivate-appcast.ts`). |
| **Jooble** | Official API (key in path) | via Jooble | Tracked redirect links passed through unmodified. Per-row underlying source surfaced in the description. |
| **Findwork** | Official API (Token header) | via Findwork | 200 req/day free tier, we use ~24. |
| **The Muse** | Official API (optional key) | via The Muse | Attribution added 2026-05-23. |
| **RemoteOK** | Public JSON feed | via RemoteOK | Attribution added 2026-05-23. Their TOS forbids **logo redistribution** — adapter drops logos and falls back to initials avatars. |
| **Remotive** | Public JSON feed | via Remotive | Attribution added 2026-05-23. |
| **Arbeitnow** | Public JSON feed | via Arbeitnow | Attribution added 2026-05-23. |
| **Greenhouse / Lever / Ashby** | Public ATS board APIs (unauthenticated) | via the company's careers page | Direct-from-employer; apply URLs (incl. `gh_jid` tracking) passed through unmodified. |
| **JSON-LD sources** | schema.org `JobPosting` from public pages | per-site (e.g. via Remotive) | Configured in `lib/sources/jsonld/sites.ts`. |

## Known risks / to revisit

1. **Adzuna no-aggregation clause** — `BUDGET_AND_APIS.md` records "must
   not aggregate with other sources without consent." We display Adzuna
   jobs alongside other sources. If Adzuna objects, either obtain consent
   or set `DISABLE_SOURCE_ADZUNA=1`.
2. **Free-tier commercial limits** generally — the no-ads decision is the
   mitigation. Keep it that way unless terms are re-checked.
3. **Attribution on JSON-LD / aggregated sources** — verify the
   underlying boards permit re-display when adding new JSON-LD sites.

## Re-enabling ads (if ever)

Before flipping ads back on you MUST re-read each active provider's terms
for commercial / ad-supported use. At minimum, Adzuna, Reed, Jooble,
Findwork and The Muse free tiers need checking; some will require a paid
or partner tier. Steps: restore `enabled = process.env.NEXT_PUBLIC_ADS_ENABLED === "1"`
in `AdsLoader.tsx` + `AdSlot.tsx`, re-add the `google-adsense-account`
meta in `app/layout.tsx`, and update this file with the review outcome.
