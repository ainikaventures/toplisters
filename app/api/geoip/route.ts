import { NextResponse, type NextRequest } from "next/server";

/**
 * IP geolocation wrapper. Cookie-cached (`tl_geoip`, 30 days) so repeat
 * visitors don't burn ipapi.co's 1k/day free tier on every page load.
 *
 * Spec line 138: detect user's location on first visit → auto-rotate the
 * globe to their region. Browser-side `navigator.geolocation` is the
 * higher-accuracy opt-in path; this is the silent default.
 *
 * Returns a slim shape `{ countryCode, lat, lng }` or null on failure.
 * The cookie value is the same shape JSON-encoded, so subsequent visits
 * skip this round-trip entirely (we read it server-side from the layout).
 */
const COOKIE_NAME = "tl_geoip";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

interface GeoIpResult {
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
}

function clientIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

async function fetchIpapi(ip: string | null): Promise<GeoIpResult | null> {
  // ipapi.co treats empty path segment as "look up the caller's IP".
  // Behind Cloudflare/Caddy in production we'll have x-forwarded-for; in
  // local dev the IP is loopback and ipapi will return null fields — we
  // still return a result so the cookie is set and we don't keep retrying.
  const url = ip && ip !== "::1" && ip !== "127.0.0.1"
    ? `https://ipapi.co/${ip}/json/`
    : "https://ipapi.co/json/";
  try {
    const response = await fetch(url, { headers: { "User-Agent": "Toplisters/1.0" } });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    if (data.error) return null;
    return {
      countryCode: typeof data.country_code === "string" ? data.country_code : null,
      lat: typeof data.latitude === "number" ? data.latitude : null,
      lng: typeof data.longitude === "number" ? data.longitude : null,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const existing = request.cookies.get(COOKIE_NAME)?.value;
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as GeoIpResult;
      return NextResponse.json(parsed);
    } catch {
      /* fall through to fresh lookup */
    }
  }

  const result = await fetchIpapi(clientIp(request));
  const payload = result ?? { countryCode: null, lat: null, lng: null };
  const response = NextResponse.json(payload);
  response.cookies.set(COOKIE_NAME, JSON.stringify(payload), {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: false,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
