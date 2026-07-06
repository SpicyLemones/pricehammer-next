// src/app/api/admin/login/route.ts
// POST {user, pass} -> sets the signed admin session cookie.
// DELETE -> clears it (logout).
import { NextResponse } from "next/server";
import { createSessionToken, verifyCredentials, SESSION_COOKIE } from "@/lib/auth";
import { logAudit } from "@/app/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AGE_S = 7 * 24 * 60 * 60; // 7 days

export async function POST(req: Request) {
  let user = "";
  let pass = "";
  try {
    const body = (await req.json()) as { user?: string; pass?: string };
    user = String(body.user ?? "");
    pass = String(body.pass ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  if (!verifyCredentials(user, pass)) {
    await logAudit("anonymous", "login-failed", { user });
    return NextResponse.json({ ok: false, error: "invalid credentials" }, { status: 401 });
  }

  const token = createSessionToken(MAX_AGE_S * 1000);
  const res = NextResponse.json({ ok: true });
  if (token) {
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: MAX_AGE_S,
      path: "/",
    });
  }
  await logAudit(user || "admin", "login", null);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
}
