/** Display helpers shared across server + client components. */

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

/** ISO-2 → readable country name. Falls back to the code if unknown. */
export function countryName(iso2: string | null | undefined): string {
  if (!iso2) return "Unknown";
  if (iso2 === "ZZ") return "Worldwide";
  try {
    return REGION_NAMES.of(iso2) ?? iso2;
  } catch {
    return iso2;
  }
}

/** "Coventry, UK" / "London, GB" / "Worldwide". */
export function locationLabel(args: {
  city: string | null;
  countryCode: string | null;
}): string {
  const country = countryName(args.countryCode);
  return args.city ? `${args.city}, ${country}` : country;
}

/** "London" / "United Kingdom" — a deterministic short label for cards. */
export function shortLocation(args: {
  city: string | null;
  countryCode: string | null;
}): string {
  return args.city ?? countryName(args.countryCode);
}

/** "$80k–$120k / yr" or "From $90k / yr" or null when no salary info. */
export function salaryLabel(args: {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
}): string | null {
  const { salaryMin, salaryMax, salaryCurrency, salaryPeriod } = args;
  if (!salaryMin && !salaryMax) return null;

  const fmt = (n: number) => {
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
    return String(n);
  };
  const symbol = currencySymbol(salaryCurrency);
  const periodSuffix = periodAbbrev(salaryPeriod);

  let amount: string;
  if (salaryMin && salaryMax) {
    amount = `${symbol}${fmt(salaryMin)}–${symbol}${fmt(salaryMax)}`;
  } else if (salaryMin) {
    amount = `From ${symbol}${fmt(salaryMin)}`;
  } else {
    amount = `Up to ${symbol}${fmt(salaryMax!)}`;
  }
  return periodSuffix ? `${amount} ${periodSuffix}` : amount;
}

function currencySymbol(currency: string | null): string {
  switch ((currency ?? "").toUpperCase()) {
    case "USD":
      return "$";
    case "GBP":
      return "£";
    case "EUR":
      return "€";
    case "JPY":
      return "¥";
    case "INR":
      return "₹";
    default:
      return currency ? `${currency} ` : "$";
  }
}

function periodAbbrev(period: string | null): string {
  switch (period) {
    case "yearly":
      return "/ yr";
    case "monthly":
      return "/ mo";
    case "daily":
      return "/ day";
    case "hourly":
      return "/ hr";
    default:
      return "";
  }
}

/** "2h ago" / "3d ago" / "Mar 12". */
export function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const WORK_MODE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "",
};

/** "Remote" / "Hybrid" / "On-site" — empty string for unknown/missing. */
export function workModeLabel(mode: string | null | undefined): string {
  return mode ? WORK_MODE_LABELS[mode] ?? "" : "";
}

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temp: "Temp",
  internship: "Internship",
};

/** "Full-time" / "Contract" / … — empty string for unknown/missing. */
export function jobTypeLabel(type: string | null | undefined): string {
  return type ? JOB_TYPE_LABELS[type] ?? "" : "";
}

/**
 * Standardized plain-text excerpt for listing cards. Collapses whitespace
 * and caps to `maxWords` (default 60 — within the 50–100 word target),
 * appending an ellipsis when truncated so every card reads at a consistent
 * length. Pair with a line-clamp in the UI for uniform card height.
 */
export function excerpt(
  text: string | null | undefined,
  maxWords = 60,
): string {
  if (!text) return "";
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return "";
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ") + "…";
}

// Approximate FX rates to USD (review periodically; this is for rough
// cross-country comparability, not financial accuracy).
const FX_TO_USD: Record<string, number> = {
  USD: 1, GBP: 1.27, EUR: 1.08, INR: 0.012, AUD: 0.66, CAD: 0.73, SGD: 0.74,
  CHF: 1.12, PLN: 0.25, BRL: 0.18, MXN: 0.058, ZAR: 0.054, NZD: 0.6, JPY: 0.0064,
  CNY: 0.14, AED: 0.27, SAR: 0.27, QAR: 0.27, KWD: 3.25, OMR: 2.6, BHD: 2.65,
  EGP: 0.02, JOD: 1.41, TRY: 0.026, ILS: 0.27,
};
const PERIOD_TO_YEAR: Record<string, number> = {
  hourly: 2080, daily: 260, weekly: 52, monthly: 12, yearly: 1,
};

/**
 * Salary normalised to annual USD for cross-country comparison/sorting.
 * Annualises the period then converts the currency; null when no salary or an
 * unknown currency. Rough by design (static FX) — for comparability, not pay.
 */
export function normalizedSalaryUsd(args: {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
}): { min: number | null; max: number | null; currency: "USD"; period: "yearly" } | null {
  const { salaryMin, salaryMax, salaryCurrency, salaryPeriod } = args;
  if (salaryMin == null && salaryMax == null) return null;
  const rate = FX_TO_USD[(salaryCurrency ?? "USD").toUpperCase()];
  if (!rate) return null;
  const mult = PERIOD_TO_YEAR[(salaryPeriod ?? "yearly").toLowerCase()] ?? 1;
  const conv = (n: number | null) => (n == null ? null : Math.round(n * mult * rate));
  return { min: conv(salaryMin), max: conv(salaryMax), currency: "USD", period: "yearly" };
}

/** Char-bounded snippet (cut on a word boundary). For API payloads. */
export function charSnippet(
  text: string | null | undefined,
  maxChars = 300,
): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "…";
}

const PERIOD_WORD: Record<string, string> = {
  hourly: "hr",
  daily: "day",
  monthly: "mo",
  yearly: "yr",
};

/**
 * Full-number salary string for API consumers, e.g. "£60,000 - £70,000 / yr",
 * "From $90,000 / yr", or null when no salary info. Uses the row currency
 * when present; falls back to grouped numbers otherwise.
 */
export function salaryRangeText(args: {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
}): string | null {
  const { salaryMin, salaryMax, salaryCurrency, salaryPeriod } = args;
  if (!salaryMin && !salaryMax) return null;

  const fmt = (n: number) => {
    if (salaryCurrency) {
      try {
        return new Intl.NumberFormat("en", {
          style: "currency",
          currency: salaryCurrency,
          maximumFractionDigits: 0,
        }).format(n);
      } catch {
        /* unknown currency code — fall through to plain number */
      }
    }
    return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(n);
  };

  let amount: string;
  if (salaryMin && salaryMax) amount = `${fmt(salaryMin)} - ${fmt(salaryMax)}`;
  else if (salaryMin) amount = `From ${fmt(salaryMin)}`;
  else amount = `Up to ${fmt(salaryMax!)}`;

  const period = salaryPeriod ? PERIOD_WORD[salaryPeriod] : null;
  return period ? `${amount} / ${period}` : amount;
}
