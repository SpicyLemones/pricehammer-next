import { NextResponse } from "next/server";

import { getTwitchConfig } from "@/app/lib/twitch-auth";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    getTwitchConfig();
    return NextResponse.json({ configured: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Missing configuration";
    const missing = message.match(/TWITCH_[A-Z_]+/g) ?? [];
    return NextResponse.json({ configured: false, missing }, { status: 200 });
  }
}

