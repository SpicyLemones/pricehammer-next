import { NextResponse } from "next/server";

import { buildTwitchAuthUrl } from "@/lib/twitch-auth";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const url = buildTwitchAuthUrl();
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Failed to create Twitch auth URL", error);
    return NextResponse.json({ error: "Twitch auth is not configured" }, { status: 500 });
  }
}

