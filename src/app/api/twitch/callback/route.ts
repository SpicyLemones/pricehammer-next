import { NextResponse } from "next/server";

import { clearSession, exchangeCodeForTokens, verifyState, writeSession } from "@/lib/twitch-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    const redirectUrl = new URL(`/twitch/wheel-of-blame?error=${encodeURIComponent(error)}`, request.url);
    return NextResponse.redirect(redirectUrl);
  }

  if (!code || !state || !verifyState(state)) {
    const redirectUrl = new URL("/twitch/wheel-of-blame?error=invalid_state", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const session = await exchangeCodeForTokens(code);
    await writeSession(session);
    const redirectUrl = new URL("/twitch/wheel-of-blame?connected=1", request.url);
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("Failed to exchange Twitch code", err);
    await clearSession();
    const redirectUrl = new URL("/twitch/wheel-of-blame?error=oauth_failed", request.url);
    return NextResponse.redirect(redirectUrl);
  }
}
