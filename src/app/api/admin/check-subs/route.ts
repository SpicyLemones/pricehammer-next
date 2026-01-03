import { NextResponse } from "next/server";
import { getValidSession, getTwitchConfig } from "@/app/lib/twitch-auth";

export async function GET() {
  const session = await getValidSession();
  const { clientId } = getTwitchConfig();

  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const res = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?user_id=${session.userId}`, {
    headers: {
      "Client-ID": clientId,
      "Authorization": `Bearer ${session.accessToken}`,
    }
  });

  const data = await res.json();
  return NextResponse.json(data);
}