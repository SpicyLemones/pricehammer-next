import { NextResponse } from "next/server";
import { clearSession, exchangeCodeForTokens, verifyState, writeSession } from "@/lib/twitch-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Dynamically determine the real public URL (spycy.fun)
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const origin = `${proto}://${host}`;

  console.log("Twitch Callback Debug:", { origin, host, proto });

  // Handle Twitch-side errors
  if (error) {
    return NextResponse.redirect(new URL(`/twitch?error=${encodeURIComponent(error)}`, origin));
  }

  // Verify OAuth state
  const { valid, redirect: desiredRedirect } = verifyState(state ?? "");
  const fallbackPath = desiredRedirect ?? "/twitch";

  if (!code || !state || !valid) {
    const errorUrl = new URL(fallbackPath, origin);
    errorUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(errorUrl);
  }

  try {
    // Exchange code for access tokens
    const session = await exchangeCodeForTokens(code, request);
    await writeSession(session);

    // Redirect to the final destination on the LIVE domain
    const successUrl = new URL(fallbackPath, origin);
    successUrl.searchParams.set("connected", "1");
    
    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error("Failed to exchange Twitch code:", err);
    await clearSession();
    
    const failUrl = new URL(fallbackPath, origin);
    failUrl.searchParams.set("error", "oauth_failed");
    return NextResponse.redirect(failUrl);
  }
}