// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Protect these paths (pages and API routes).
 * NOTE: must be a literal array for Next to statically analyze it.
 */
export const config = {
  matcher: [
    "/",
    "/admin",
    "/admin/:path*",
    "/tinder",
    "/tinder/:path*",
    "/api/download/:path*",
    "/api/export",
    "/api/seed/:path*",
    "/api/auto-validate",
    "/api/refresh-prices",
    "/api/report-wrong",
    "/api/report-wrong-by-link", // bypassed below (public)
  ],
};

const SESSION_COOKIE = "ph_admin";

/** Verify the signed session cookie on the Edge runtime (Web Crypto). */
async function verifySession(token: string | undefined, user: string, pass: string): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expires = Number(token.slice(0, dot));
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const given = token.slice(dot + 1);

  const keyData = new TextEncoder().encode(`${user}:${pass}:ph-session-v1`);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`admin:${expires}`));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return given === expected;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || "";

  if (host.includes("pricehammer.xyz") && pathname === "/") {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/price-lookup";
    return NextResponse.redirect(redirectUrl);
  }

  // Root page stays public
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Public endpoints and the login page itself
  if (
    pathname === "/api/report-wrong-by-link" ||
    pathname.startsWith("/api/report-wrong-by-link/") ||
    pathname === "/admin/login" ||
    pathname === "/api/admin/login"
  ) {
    return NextResponse.next();
  }

  // (Optional) allow CORS preflights through everywhere
  if (req.method === "OPTIONS") return NextResponse.next();

  // If you don't set creds in env, allow through (handy in dev)
  const USER = process.env.ADMIN_USER;
  const PASS = process.env.ADMIN_PASS;
  if (!USER || !PASS) return NextResponse.next();

  // 1) session cookie (browser login)
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySession(token, USER, PASS)) {
    return NextResponse.next();
  }

  // 2) Basic Auth (curl, scheduled jobs)
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    // Middleware runs on the Edge runtime (no Node Buffer); use atob
    const decoded = atob(auth.slice(6)); // "user:pass"
    const [u, p] = decoded.split(":");
    if (u === USER && p === PASS) return NextResponse.next();
  }

  // Pages: send the human to the login form. APIs: 401 challenge for tools.
  const isApi = pathname.startsWith("/api/");
  if (!isApi) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(loginUrl);
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
  });
}
