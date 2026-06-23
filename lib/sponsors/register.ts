import type { SponsorRow, SponsorRating } from "./match";

/**
 * Fetch the UK Register of Licensed Sponsors (Workers) from gov.uk.
 *
 * The CSV lives at a dated assets.publishing.service.gov.uk URL that changes
 * each republish (~every business day), so we scrape the current link off the
 * publication page rather than hardcoding it. ~142k rows.
 */

const PAGE_URL =
  "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";
const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";

/** Resolve the current CSV asset URL from the gov.uk publication page. */
export async function resolveCsvUrl(): Promise<string> {
  const res = await fetch(PAGE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`gov.uk page returned ${res.status}`);
  const html = await res.text();
  const m = html.match(
    /https:\/\/assets\.publishing\.service\.gov\.uk\/[^"'\s]+\.csv/i,
  );
  if (!m) throw new Error("Could not find the register CSV link on the gov.uk page");
  return m[0];
}

export async function fetchRegisterRows(): Promise<SponsorRow[]> {
  const url = await resolveCsvUrl();
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`register CSV returned ${res.status}`);
  return parseRegisterCsv(await res.text());
}

/** Minimal RFC-4180-ish CSV parser (handles quotes, embedded commas/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseRegisterCsv(text: string): SponsorRow[] {
  const records = parseCsv(text);
  if (records.length < 2) return [];
  const header = records[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.findIndex((h) => h.includes("organisation") || h.includes("name"));
  const routeIdx = header.findIndex((h) => h.includes("route"));
  const ratingIdx = header.findIndex((h) => h.includes("rating") || h.includes("type"));
  if (nameIdx < 0) throw new Error("register CSV missing an Organisation Name column");

  const rows: SponsorRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    const name = (r[nameIdx] ?? "").trim();
    if (!name) continue;
    const route = routeIdx >= 0 ? (r[routeIdx] ?? "").trim() : "";
    const ratingText = ratingIdx >= 0 ? (r[ratingIdx] ?? "") : "";
    const rm = ratingText.match(/\(([AB])\s*rating\)/i);
    const rating: SponsorRating = rm ? (rm[1].toUpperCase() as "A" | "B") : null;
    rows.push({ name, route, rating });
  }
  return rows;
}
