import { NextResponse } from "next/server";

import { fetchChatters, getValidSession } from "@/lib/twitch-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getValidSession();
    if (!session) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const data = await fetchChatters(session);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch Twitch chatters", error);
    return NextResponse.json({ error: "twitch_error" }, { status: 500 });
  }
}

