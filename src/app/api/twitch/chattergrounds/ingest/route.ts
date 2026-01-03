import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { applyChattergroundsAction, getData, type PersistAction } from "@/app/api/twitch/chattergrounds/route";

type EventSubEnvelope = {
  challenge?: string;
  subscription?: { type: string };
  event?: Record<string, any>;
};

function verifyTwitchSignature({
  body,
  headers,
}: {
  body: string;
  headers: Headers;
}) {
  const secret = process.env.CHATTERGROUNDS_INGEST_SECRET;
  if (!secret) {
    console.warn("⚠️ CHATTERGROUNDS_INGEST_SECRET is missing. Skipping signature check.");
    return true; 
  }

  const messageId = headers.get("twitch-eventsub-message-id") ?? "";
  const timestamp = headers.get("twitch-eventsub-message-timestamp") ?? "";
  const signature = headers.get("twitch-eventsub-message-signature") ?? "";

  if (!messageId || !timestamp || !signature.startsWith("sha256=")) return false;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(messageId + timestamp + body);
  const expected = `sha256=${hmac.digest("hex")}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function handleNotification(subscriptionType: string, envelope: EventSubEnvelope) {
  const event = envelope.event ?? {};
  const broadcasterId = event.broadcaster_user_id || event.broadcaster_id;
  
  if (!broadcasterId) return NextResponse.json({ error: "No broadcaster ID" }, { status: 400 });

  const actions: PersistAction[] = [];

  // --- LOGIC FOR CHAT MESSAGES ---
  if (subscriptionType === "channel.chat.message") {
    const chatterId = event.chatter_user_id; 
    const text = event.message?.text; // Correctly accessing the .text property
    
    if (chatterId && text) {
      actions.push({ action: "record-message", chatterId, message: text });
    }
  } 
  // --- LOGIC FOR BANS ---
  else if (subscriptionType === "channel.ban") {
    const chatterId = event.user_id;
    if (chatterId) {
      actions.push({ action: event.is_permanent ? "ban" : "timeout", chatterId });
    }
  }

  // Execute Database Actions
  for (const action of actions) {
    await applyChattergroundsAction(action, {
      sessionUserId: broadcasterId,
      origin: "twitch",
    });
  }

  return NextResponse.json({ ok: true, count: actions.length });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const headers = request.headers;

  // 1. Security Check (Required for both Challenge and Notifications)
  if (!verifyTwitchSignature({ body: rawBody, headers })) {
    console.error("❌ Invalid Twitch Signature");
    return new Response("Unauthorized", { status: 401 });
  }

  let body: EventSubEnvelope;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const messageType = headers.get("twitch-eventsub-message-type");
  const subscriptionType = headers.get("twitch-eventsub-subscription-type") ?? body.subscription?.type ?? "";

  // 2. Handle Verification Handshake
  if (messageType === "webhook_callback_verification") {
    console.log("✅ Responding to Twitch Verification Challenge");
    return new Response(body.challenge, { 
      status: 200, 
      headers: { "Content-Type": "text/plain" } 
    });
  }

  // 3. Handle Actual Data
  if (messageType === "notification") {
    return handleNotification(subscriptionType, body);
  }

  return new Response("OK", { status: 200 });
}