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
