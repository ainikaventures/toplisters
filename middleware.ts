import { NextResponse, type NextRequest } from "next/server";

const ADMIN_USER = process.env.ADMIN_USER ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me-locally";

/**
 * Edge middleware. Two jobs:
 *
 *  1. Multi-vertical host routing. The sports vertical is served from the
 *     same app at `sports.toplisters.xyz`; we rewrite that host's requests
 *     into the internal `/sports/*` route group. `/api/*` is left alone
 *     (server endpoints are host-agnostic — e.g. /api/sports/roadmap), and
 *     so are paths already under /sports, to avoid double-prefixing.
 *
 *  2. HTTP basic-auth gate for /admin/* (one-operator moderation queue).
 *
 * The matcher runs site-wide (minus static assets), so the admin gate is
 * explicitly scoped to /admin here rather than via the matcher.
 *
 * Edge runtime has no Node `Buffer`; we use the Web Platform `atob`.
 */
export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0];
  const path = request.nextUrl.pathname;

  // 1. Sports subdomain → /sports route group.
  const isSports = host === "sports.toplisters.xyz" || host.startsWith("sports.");
  if (isSports && !path.startsWith("/sports") && !path.startsWith("/api")) {
    const url = request.nextUrl.clone();
    url.pathname = path === "/" ? "/sports" : `/sports${path}`;
    return NextResponse.rewrite(url);
  }

  // 2. Admin basic auth (scoped to /admin/*).
  if (path.startsWith("/admin")) {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Basic ")) {
      return new NextResponse("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Toplisters Admin"' },
      });
    }
    const decoded = atob(auth.slice(6).trim());
    const sep = decoded.indexOf(":");
    if (sep < 0) return new NextResponse("Bad credentials", { status: 401 });
    const user = decoded.slice(0, sep);
    const password = decoded.slice(sep + 1);
    if (user !== ADMIN_USER || password !== ADMIN_PASSWORD) {
      return new NextResponse("Wrong credentials", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Toplisters Admin"' },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run everywhere except Next internals + obvious static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
