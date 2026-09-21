import { getTopCategories, getTopCities, getTopCountries } from "@/lib/seo/internal-links";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Country/city volumes shift slowly and the underlying helpers are on a
// 1-hour cache anyway; matching that here keeps the route off the DB for
// the crawlers that poll it.
export const revalidate = 3600;

function abs(path: string): string {
  return `${SITE_URL}${path}`;
}

function link(path: string, label: string, note: string): string {
  return `- [${label}](${abs(path)}): ${note}`;
}

/**
 * /llms.txt — the llmstxt.org convention: a markdown map of the site for
 * AI crawlers and answer engines.
 *
 * Worth serving now because the AI crawlers were unblocked in July 2026
 * (the Cloudflare managed robots rule that was 403-ing GPTBot/ClaudeBot/
 * PerplexityBot is off), so this file has an actual audience.
 *
 * Served as text/plain per the convention — browsers render it inline
 * instead of prompting a download, and the crawlers don't care.
 */
export async function GET() {
  const [countries, cities, categories] = await Promise.all([
    getTopCountries(15),
    getTopCities(20),
    getTopCategories(15),
  ]);

  const sections: string[] = [
    `# Toplisters`,
    ``,
    `> A globally-aware job board. Roles are aggregated from public job APIs and company ATS feeds, deduplicated, geocoded, and browsable by country, city, and role — or on an interactive 3D globe. Free to browse, free to post, no account required.`,
    ``,
    `Listings link out to the original employer or source posting; Toplisters is an index, not the hiring party. Jobs are refreshed continuously and expired roles are deactivated, so listing counts below change over time.`,
    ``,
    `## Core pages`,
    ``,
    link("/", "Home", "Latest roles, surfaced for the visitor's region first"),
    link("/jobs", "All jobs", "Full searchable index — filter by country, city, role, work mode, salary, and visa sponsorship"),
    link("/jobs/locations", "Locations directory", "Every country with active roles, with its top cities"),
    link("/globe", "Interactive globe", "3D map of where the open roles are"),
    link("/companies", "Companies", "Employers currently hiring, with their open roles"),
    link("/post-a-job", "Post a job", "Free job posting, magic-link confirmation, no account"),
    link("/alerts", "Email alerts", "Weekly digest of new roles matching your filters"),
    link("/sitemap", "HTML sitemap", "Human-readable index of the site's sections"),
    ``,
    `## About & policies`,
    ``,
    link("/about", "About", "What Toplisters is, how listings are gathered, and who runs it"),
    link("/sources", "Sources", "Every upstream job feed and API, with attribution terms"),
    link("/privacy", "Privacy", "Cookieless analytics, what's stored, and how to opt out"),
    link("/contact", "Contact", "Get in touch about a listing or the site"),
  ];

  if (countries.length > 0) {
    sections.push(
      ``,
      `## Jobs by country`,
      ``,
      ...countries.map((c) =>
        link(`/jobs/${c.slug}`, `Jobs in ${c.name}`, `${c.totalJobs.toLocaleString()} active roles`),
      ),
    );
  }

  if (cities.length > 0) {
    sections.push(
      ``,
      `## Jobs by city`,
      ``,
      ...cities.map((c) =>
        link(c.href, `Jobs in ${c.name}, ${c.countryName}`, `${c.totalJobs.toLocaleString()} active roles`),
      ),
    );
  }

  if (categories.length > 0) {
    sections.push(
      ``,
      `## Jobs by role`,
      ``,
      ...categories.map((c) =>
        link(c.href, `${c.value} jobs`, `${c.totalJobs.toLocaleString()} active roles`),
      ),
    );
  }

  sections.push(
    ``,
    `## Optional`,
    ``,
    link("/sitemap.xml", "XML sitemap index", "Machine-readable index of every job and location URL"),
    ``,
  );

  return new Response(sections.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
