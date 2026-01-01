import { NextResponse } from "next/server";

import { clearSession, exchangeCodeForTokens, verifyState, writeSession } from "@/lib/twitch-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    const redirectUrl = new URL(`/twitch?error=${encodeURIComponent(error)}`, request.url);
    return NextResponse.redirect(redirectUrl);
  }

  const { valid, redirect: desiredRedirect } = verifyState(state ?? "");
  const fallbackRedirect = desiredRedirect ?? "/twitch";

  if (!code || !state || !valid) {
    const redirectUrl = new URL(fallbackRedirect, request.url);
    redirectUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const session = await exchangeCodeForTokens(code);
    await writeSession(session);
    const redirectUrl = new URL(fallbackRedirect, request.url);
    redirectUrl.searchParams.set("connected", "1");
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("Failed to exchange Twitch code", err);
    await clearSession();
    const redirectUrl = new URL(fallbackRedirect, request.url);
    redirectUrl.searchParams.set("error", "oauth_failed");
    return NextResponse.redirect(redirectUrl);
  }
}
