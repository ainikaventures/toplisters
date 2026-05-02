import { NextResponse, type NextRequest } from "next/server";

const ADMIN_USER = process.env.ADMIN_USER ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me-locally";

/**
 * HTTP basic auth gate for /admin/*. Spec line 163: "HTTP basic auth via
 * env credentials" — keeps the moderation queue off the open web without
 * needing a full auth stack for one operator. Browsers handle the prompt.
 *
 * Edge runtime (Next middleware) doesn't have Node's `Buffer`; using the
 * Web Platform `atob` instead.
 */
export function middleware(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Toplisters Admin"' },
    });
  }

  const decoded = atob(auth.slice(6).trim());
  const sep = decoded.indexOf(":");
  if (sep < 0) {
    return new NextResponse("Bad credentials", { status: 401 });
  }
  const user = decoded.slice(0, sep);
  const password = decoded.slice(sep + 1);

  if (user !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    return new NextResponse("Wrong credentials", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Toplisters Admin"' },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
