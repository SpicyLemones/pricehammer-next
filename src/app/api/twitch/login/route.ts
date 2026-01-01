import { NextResponse } from "next/server";

import { buildTwitchAuthUrl } from "@/lib/twitch-auth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirect = searchParams.get("redirect") ?? undefined;
  const safeRedirect = redirect && redirect.startsWith("/") ? redirect : undefined;
  try {
    const url = buildTwitchAuthUrl(safeRedirect);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Failed to create Twitch auth URL", error);
    return NextResponse.json({ error: "Twitch auth is not configured" }, { status: 500 });
  }
}
