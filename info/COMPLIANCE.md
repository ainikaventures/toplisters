# Data-source compliance

How Toplisters stays within its job-data providers' terms. This is an
engineering record, not legal advice — re-read each provider's current
terms before scaling, and especially before re-enabling ads.

_Last reviewed: 2026-05-23._

## TailWright integration (separate commercial product)

TailWright (separate paid auto-apply product, tailwright.com) may consume
**only direct-from-employer ATS data**, never the licensed aggregators:

- **`GET /api/ats-jobs`** (`app/api/ats-jobs/route.ts`) is a public read-only
  index scoped to `source IN (greenhouse, lever, ashby)` only — company,
  title, apply URL (the employer's own posting), with a `?view=companies`
  count mode. **Aggregator rows (Adzuna/Reed/Jooble/Findwork/Muse) are
  never exposed** — their terms forbid commercial reuse, and Adzuna
  specifically prohibits "vacancy counts". Counts/titles here are derived
  only from the safe sources.
- Rationale: TailWright can only fetch/apply where an employer has a
  reachable ATS/career page, so the aggregator-only rows are unactionable
  anyway — scoping to ATS costs nothing actionable.
- The earlier `applyops_ro` DB role + `ats_jobs` view (same scope, DB-level)
  are now redundant given this API; keep or drop per preference.

## Posture (the load-bearing decisions)

- **No ads / non-commercial.** AdSense is hard-disabled site-wide
  (`components/ads/AdsLoader.tsx` + `AdSlot.tsx` force `enabled = false`,
  and the `google-adsense-account` ownership meta is removed from
  `app/layout.tsx`). Most of the free-tier job APIs we use permit
  **personal / non-commercial** use only; running ads would put us in
  breach. Re-enabling ads is therefore a **terms-review trigger**, not a
  config flip — see "Re-enabling ads" below.
- **Donations are cost-recovery only.** A GitHub Sponsors link
  ("Support hosting", in the footer + `/about`) lets users help cover the
  hosting bill. It is **voluntary, never paywalls or gates any listing,
  and isn't tied to provider data** — framed as cost-recovery, not
  profit, so the site stays non-commercial for the free tiers. This is a
  softer version of the ads question; if scaling or if Adzuna's
  "commercial organisation" line is ever in doubt, confirm with them
  (Adzuna is the only provider whose terms would bite).
- **Official APIs only.** Every source is an official REST API or a
  public ATS board endpoint. No scraping behind logins. LinkedIn and
  Indeed are deliberately not integrated (they restrict scraping/API
  access — see `info/BUDGET_AND_APIS.md`).
- **Link out, never clone.** "Apply" goes through
  `/api/jobs/[id]/click` → 303 redirect to the original `applyUrl`,
  unmodified, preserving each provider's affiliate / tracking params.
- **Attribution shown, per provider's required format.** The job detail
  page renders credit via `lib/sources/attribution.ts`, which honors each
  provider's mandated wording / link behavior (default is "via {Name}" →
  apply URL, `nofollow`). The `/sources` table uses the plain
  `JobSource.attribution` string.
- **Bounded retention.** Jobs not re-seen for 30 days are set
  `isActive=false` (`lib/jobs/stale.ts`); soft-delete keeps analytics.
- **Per-source kill-switch.** `DISABLE_SOURCE_<NAME>=1` disables any
  source instantly without a deploy.

## Per-provider

| Provider | Access | Required attribution format | How we render it |
|---|---|---|---|
| **Adzuna** | Official API (`app_id`/`app_key`) | ToS-mandated: label **"Jobs by Adzuna"**, "Jobs" hyperlinked to adzuna.co.uk | "Jobs by Adzuna" with "Jobs" → adzuna.co.uk (special-cased in `attribution.ts`). Also: personal-use-only + **no-aggregation-without-consent** (see risks); apply via `redirect_url` unmodified; predicted salaries dropped. |
| **RemoteOK** | Public JSON feed | ToS-mandated: **dofollow** backlink to the RemoteOK listing ("without nofollow!") + mention "Remote OK"; **no logo** without permission | "via RemoteOK" → `remoteok.com/remote-jobs/{id}`, `rel="noopener"` (dofollow). Logos already dropped (initials avatar). |
| **The Muse** | Official API (optional key) | Content must link back to themuse.com (§3.4) — no specific phrase | "via The Muse" → apply URL (always a themuse.com page). |
| **Reed** | Official API (Basic auth) | Per API agreement (registration); attribution + link-back | "via Reed" → reed.co.uk job URL. Appcast syndicator rows filtered (`reed.ts` + `scripts/deactivate-appcast.ts`). Confirm exact wording in the key agreement. |
| **Jooble** | Official API (key in path) | No public format; per key agreement | "via Jooble"; tracked redirect links passed through unmodified. Confirm in agreement. |
| **Findwork** | Official API (Token header) | None found public | "via Findwork". 200 req/day free tier, we use ~24. |
| **Remotive** | Public JSON feed | Open API, link-back appreciated, no mandated format | "via Remotive" → apply URL. |
| **Arbeitnow** | Public JSON feed | Open API, no mandated format | "via Arbeitnow" → apply URL. |
| **Greenhouse / Lever / Ashby** | Public ATS board APIs (unauthenticated) | None — employer's own data | "via the company's careers page"; apply URLs (incl. `gh_jid` tracking) passed through unmodified. |
| **JSON-LD sources** | schema.org `JobPosting` from public pages | per-site | "via {site}" (configured in `lib/sources/jsonld/sites.ts`). |
| **Recruitment Revolution** | Public WordPress REST API (`/wp-json/wp/v2/job-posting`, unauthenticated) | None found public | "via Recruitment Revolution" → the vacancy page (where you apply). Recruiter's own postings; `companyName` is the recruiter, link-out only, no scraping behind logins. |

Default render for any source without a special case: **"via {displayName}"
→ apply URL, `rel="noopener nofollow"`**. Adzuna and RemoteOK are the only
special cases in `attribution.ts` (their terms mandate a specific
label / a follow link, respectively).

## Known risks / to revisit

1. **Adzuna no-aggregation clause** — `BUDGET_AND_APIS.md` records "must
   not aggregate with other sources without consent." We display Adzuna
   jobs alongside other sources. If Adzuna objects, either obtain consent
   or set `DISABLE_SOURCE_ADZUNA=1`.
2. **Free-tier commercial limits** generally — the no-ads decision is the
   mitigation. Keep it that way unless terms are re-checked.
3. **Attribution on JSON-LD / aggregated sources** — verify the
   underlying boards permit re-display when adding new JSON-LD sites.

## Sources deliberately NOT ingested

- **Gulf regional boards — Bayt, GulfTalent, NaukriGulf** (vetted 2026-06):
  none offer an official/partner free feed; all prohibit automated
  scraping/reproduction in their terms (GulfTalent: *"you agree not to…
  scrape content… except as a search engine… minimal snippets"*; NaukriGulf:
  *"not… robots/crawlers… to scrape/extract… without explicit consent in
  writing"*), and Bayt + NaukriGulf actively block non-browser clients
  (Cloudflare / Akamai) and named aggregator bots. We do **not** scrape them.
  **Gulf coverage is provided compliantly via Jooble's official API**
  (UAE/Saudi/Qatar/Kuwait/Oman/Bahrain in `DEFAULT_LOCATIONS`). Revisit only
  with a signed partner/data agreement.

## Re-enabling ads (if ever)

Before flipping ads back on you MUST re-read each active provider's terms
for commercial / ad-supported use. At minimum, Adzuna, Reed, Jooble,
Findwork and The Muse free tiers need checking; some will require a paid
or partner tier. Steps: restore `enabled = process.env.NEXT_PUBLIC_ADS_ENABLED === "1"`
in `AdsLoader.tsx` + `AdSlot.tsx`, re-add the `google-adsense-account`
meta in `app/layout.tsx`, and update this file with the review outcome.
