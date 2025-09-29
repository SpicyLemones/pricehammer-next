// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Protect these paths (pages and API routes).
 * NOTE: must be a literal array for Next to statically analyze it.
 */
export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/tinder",
    "/tinder/:path*",
    "/api/export",
    "/api/seed/:path*",
    "/api/auto-validate",
    "/api/refresh-prices",
    "/api/report-wrong",
    "/api/report-wrong-by-link",
  ],
};

export function middleware(req: NextRequest) {
  // If you don't set creds in env, allow through (handy in dev)
  const USER = process.env.ADMIN_USER;
  const PASS = process.env.ADMIN_PASS;
  if (!USER || !PASS) return NextResponse.next();

  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    // Middleware runs on the Edge runtime (no Node Buffer); use atob
    const decoded = atob(auth.slice(6)); // "user:pass"
    const [u, p] = decoded.split(":");
    if (u === USER && p === PASS) return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
  });
}
