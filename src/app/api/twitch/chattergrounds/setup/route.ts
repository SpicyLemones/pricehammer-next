import { NextResponse } from "next/server";

export async function GET() {
  const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
  const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
  const SECRET = process.env.CHATTERGROUNDS_INGEST_SECRET;
  const CALLBACK_URL = "https://www.spycy.fun/api/twitch/chattergrounds/ingest";
  
  // PASTE YOUR NUMERIC ID HERE
  const BROADCASTER_ID = "YOUR_NUMERIC_ID_HERE"; 

  try {
    // 1. Get an App Access Token from Twitch
    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      grant_type: "client_credentials",
    });

    const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token?${tokenParams.toString()}`, { 
      method: "POST" 
    });
    const { access_token } = await tokenRes.json();

    // 2. Register the 'channel.chat.message' subscription
    const subRes = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Client-Id": CLIENT_ID!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "channel.chat.message",
        version: "1",
        condition: {
          broadcaster_user_id: BROADCASTER_ID,
          user_id: BROADCASTER_ID, // Required for chat message events
        },
        transport: {
          method: "webhook",
          callback: CALLBACK_URL,
          secret: SECRET,
        },
      }),
    });

    const result = await subRes.json();
    return NextResponse.json({ 
        message: "Registration attempt complete", 
        twitch_response: result 
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}