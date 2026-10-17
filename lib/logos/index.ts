// Server-only path. Reachable from Next route handlers AND tsx CLI
// scripts (npm run source / worker), so we skip the `server-only` import.
import { prisma } from "@/lib/db";
import { searchBrand } from "./logodev";
import { normalizeLogoDomain, selfHostedLogoUrl } from "./store";

/** ms; how long a cached miss (no logo found) is trusted before retrying. */
const NEGATIVE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

// Hosts that belong to job boards / ATS vendors, not the employer. A source
// "domain" on one of these (e.g. an Adzuna apply link that lands on
// boards.greenhouse.io) would give every such company the vendor's logo.
const NON_EMPLOYER_HOSTS = [
  "greenhouse.io", "lever.co", "ashbyhq.com", "myworkdayjobs.com", "myworkdaysite.com", "workday.com",
  "smartrecruiters.com", "workable.com", "bamboohr.com", "recruitee.com", "teamtailor.com",
  "personio.de", "personio.com", "icims.com", "taleo.net", "successfactors.com", "successfactors.eu",
  "jobvite.com", "breezy.hr", "applytojob.com", "jazzhr.com", "oraclecloud.com", "eightfold.ai",
  "linkedin.com", "indeed.com", "glassdoor.com", "google.com", "adzuna.com", "adzuna.co.uk",
  "reed.co.uk", "jooble.org", "themuse.com", "remoteok.com", "remotive.com", "arbeitnow.com",
];

/** The employer's own domain from a source hint, or null if it's a vendor host. */
function companyDomainHint(raw: string | null | undefined): string | null {
  const d = raw ? normalizeLogoDomain(raw) : null;
  if (!d) return null;
  if (NON_EMPLOYER_HOSTS.some((h) => d === h || d.endsWith(`.${h}`))) return null;
  // careers.acme.com → acme.com (keep at least two labels).
  const stripped = d.replace(/^(careers|jobs|career|apply|join|work|recruiting|talent)\./, "");
  return stripped.includes(".") ? stripped : d;
}

/**
 * Resolve a logo URL for the given company name. Cache hits return
 * immediately. When the source already told us the company's domain
 * (Workable, enriched Adzuna rows…) we use it directly — no Logo.dev
 * search call. Otherwise one brand search, cached positive or negative
 * (negative entries expire after NEGATIVE_TTL). Search errors (quota
 * exhausted, rate limit, outage) are never cached as "no logo".
 *
 * Used by the aggregation pipeline as the fallback when a source doesn't
 * ship a logo URL of its own (e.g. RemoteOK as of 2025).
 */
export async function resolveCompanyLogo(
  companyName: string,
  domainHint?: string | null,
): Promise<string | null> {
  const normalized = normalize(companyName);
  if (!normalized) return null;

  const cached = await prisma.companyLogo.findUnique({
    where: { normalizedName: normalized },
  });
  if (cached?.logoUrl) return cached.logoUrl;

  const hinted = companyDomainHint(domainHint);
  if (!hinted && cached) {
    const ageMs = Date.now() - cached.lookedUpAt.getTime();
    if (ageMs < NEGATIVE_TTL) return null; // negative cache still fresh
    // Otherwise fall through and re-look-up.
  }

  let domain = hinted;
  if (!domain) {
    const found = await searchBrand(companyName);
    if (found.kind === "error") return null; // unknown — retry on a later run
    domain = found.kind === "match" ? normalizeLogoDomain(found.result.domain) : null;
  }
  // Our own /logos/<domain> (downloaded once via the API on first view),
  // never the img.logo.dev CDN — see lib/logos/store.ts.
  const imgUrl = domain ? selfHostedLogoUrl(domain) : null;

  await prisma.companyLogo.upsert({
    where: { normalizedName: normalized },
    create: {
      normalizedName: normalized,
      displayName: companyName,
      domain,
      logoUrl: imgUrl,
    },
    update: {
      displayName: companyName,
      domain,
      logoUrl: imgUrl,
      lookedUpAt: new Date(),
    },
  });

  return imgUrl;
}
