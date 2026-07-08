import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { sourceType } from "@/lib/api/sources";

/**
 * Rebuild the company directory from active jobs — one row per employer, with
 * their locations, logo, categories and open-role count. Groups raw company
 * names by a normalised key (so "Freshworks" / "Freshworks Inc" merge), picks
 * the most common display name, and prunes companies with no active jobs.
 */

const STRIP =
  /\b(ltd|limited|plc|llp|llc|inc|incorporated|corp|corporation|co|company|group|holdings?|pvt|private|technologies|technology|solutions|systems|labs|software|india|global|international|the)\b/g;

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(STRIP, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Agg {
  names: Map<string, number>;
  domain: string | null;
  logoUrl: string | null;
  countryCodes: Set<string>;
  cities: Set<string>;
  categories: Map<string, number>;
  hasDirect: boolean;
  visaFriendly: boolean;
  jobCount: number;
  lastJobAt: Date | null;
}

export interface CompanyRebuildStats {
  jobs: number;
  companies: number;
  pruned: number;
}

export async function rebuildCompanies(): Promise<CompanyRebuildStats> {
  const jobs = await prisma.job.findMany({
    where: { isActive: true },
    select: {
      companyName: true,
      companyDomain: true,
      companyLogoUrl: true,
      countryCode: true,
      city: true,
      category: true,
      source: true,
      lastSeenAt: true,
      postedDate: true,
      employerLicensedSponsor: true,
      flexibleVisa: true,
      visaSponsorship: true,
    },
  });

  const groups = new Map<string, Agg>();
  for (const j of jobs) {
    const key = normalizeCompany(j.companyName);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = {
        names: new Map(),
        domain: null,
        logoUrl: null,
        countryCodes: new Set(),
        cities: new Set(),
        categories: new Map(),
        hasDirect: false,
        visaFriendly: false,
        jobCount: 0,
        lastJobAt: null,
      };
      groups.set(key, g);
    }
    g.names.set(j.companyName, (g.names.get(j.companyName) ?? 0) + 1);
    if (!g.domain && j.companyDomain) g.domain = j.companyDomain;
    if (!g.logoUrl && j.companyLogoUrl) g.logoUrl = j.companyLogoUrl;
    if (j.countryCode && j.countryCode !== "ZZ") g.countryCodes.add(j.countryCode);
    if (j.city) g.cities.add(j.city);
    if (j.category) g.categories.set(j.category, (g.categories.get(j.category) ?? 0) + 1);
    if (sourceType(j.source) === "direct") g.hasDirect = true;
    if (j.flexibleVisa || j.employerLicensedSponsor === true || j.visaSponsorship === true) {
      g.visaFriendly = true;
    }
    g.jobCount++;
    const when = j.lastSeenAt ?? j.postedDate;
    if (when && (!g.lastJobAt || when > g.lastJobAt)) g.lastJobAt = when;
  }

  const topKeys = (m: Map<string, number>, n: number): string[] =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

  // Mark-and-sweep prune: capture the run start, upsert every current company
  // (which stamps @updatedAt), then delete rows untouched this run. Avoids
  // passing thousands of slugs to `notIn` (Postgres bind-parameter limit → P2029).
  const runStart = new Date();
  const slugs = new Set<string>();
  let companies = 0;
  for (const [key, g] of groups) {
    const name = topKeys(g.names, 1)[0] ?? key;
    // Slug from the normalised key so it's stable across rebuilds.
    const base = slugify(key);
    if (!base) continue;
    let slug = base;
    let n = 2;
    while (slugs.has(slug)) slug = `${base}-${n++}`;
    slugs.add(slug);

    const data = {
      name,
      normalizedName: key,
      companyNames: [...g.names.keys()],
      domain: g.domain,
      logoUrl: g.logoUrl,
      jobCount: g.jobCount,
      countryCodes: [...g.countryCodes].sort(),
      cities: [...g.cities].slice(0, 40),
      categories: topKeys(g.categories, 6),
      hasDirect: g.hasDirect,
      visaFriendly: g.visaFriendly,
      lastJobAt: g.lastJobAt,
    };
    await prisma.company.upsert({
      where: { slug },
      create: { slug, ...data },
      update: data,
    });
    companies++;
  }

  const pruned = await prisma.company.deleteMany({ where: { updatedAt: { lt: runStart } } });
  return { jobs: jobs.length, companies, pruned: pruned.count };
}
