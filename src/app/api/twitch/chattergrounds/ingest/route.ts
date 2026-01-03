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
  if (!secret) return true; // WARNING: In production, fail if secret is missing

  const messageId = headers.get("twitch-eventsub-message-id") ?? "";
  const timestamp = headers.get("twitch-eventsub-message-timestamp") ?? "";
  const signature = headers.get("twitch-eventsub-message-signature") ?? "";

  if (!messageId || !timestamp || !signature.startsWith("sha256=")) {
    return false;
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(messageId + timestamp + body);
  const expected = `sha256=${hmac.digest("hex")}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function resolveBroadcasterId(event?: Record<string, any>) {
  return (
    event?.broadcaster_user_id || // Standard for channel.* events
    event?.broadcasterId ||
    event?.broadcaster_id ||
    event?.channel_id ||
    null
  );
}

async function handleNotification(subscriptionType: string, envelope: EventSubEnvelope) {
  const event = envelope.event ?? {};
  const broadcasterId = resolveBroadcasterId(event);
  
  const bIdString = typeof broadcasterId === "string" ? broadcasterId : undefined;

  // Resolve Owner info for context
  const owner =
    event?.broadcaster_user_id || event?.broadcaster_user_login || event?.broadcaster_user_name
      ? {
          userId: event.broadcaster_user_id,
          login: event.broadcaster_user_login,
          displayName: event.broadcaster_user_name,
        }
      : undefined;

  const actions: PersistAction[] = [];

  // --- LOGIC FIX HERE ---
  if (subscriptionType === "channel.chat.message") {
    // 1. chatter_user_id is the person speaking
    const chatterId = event.chatter_user_id; 
    
    // 2. Extract text safely. event.message is an OBJECT in this sub type.
    // Structure: { text: "Hello", fragments: [...] }
    const text = event.message?.text; 
    
    if (chatterId && text) {
      actions.push({ 
        action: "record-message", 
        chatterId, 
        message: text 
      });
    }
  } else if (subscriptionType === "channel.ban") {
    const chatterId = event.user_id; // The user being banned
    const isPermanent = event.is_permanent;
    if (chatterId) {
      actions.push({ action: isPermanent ? "ban" : "timeout", chatterId });
    }
  } else if (subscriptionType === "channel.subscription" || subscriptionType === "channel.subscription.message") {
    const chatterId = event.user_id;
    // tier is often "1000", "2000", "3000" or "Prime"
    // cumulative_months is usually available in subscription.message
    const months = event.cumulative_months ?? 1; 
    if (chatterId) {
      actions.push({ action: "sub-months", chatterId, months });
    }
  }

  // Execute Actions
  const results: PersistAction[] = [];
  for (const action of actions) {
    // We explicitly pass the broadcaster ID found in the event
    const result = await applyChattergroundsAction(action, {
      sessionUserId: bIdString,
      owner,
      origin: "twitch",
    });
    
    if (result && "error" in result) {
      console.error("❌ Chattergrounds DB Error:", action, result.error);
      // Don't fail the webhook response, just log it, otherwise Twitch retries endlessly
    } else {
      results.push(action);
    }
  }

  if (!results.length) {
    return NextResponse.json({ ok: true, note: "Event parsed but no actions taken" });
  }

  // Refresh cache/data after update
  const data = await getData(bIdString);
  return NextResponse.json({ ok: true, applied: results, data });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let body: EventSubEnvelope;
  
  try {
    body = JSON.parse(rawBody) as EventSubEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messageType = request.headers.get("twitch-eventsub-message-type");
  const subscriptionType = request.headers.get("twitch-eventsub-subscription-type") ?? body.subscription?.type ?? "";

  // 1. Verify Verification Challenge (Handshake)
  if (messageType === "webhook_callback_verification" && body.challenge) {
    return new Response(body.challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  // 2. Security Check
  if (!verifyTwitchSignature({ body: rawBody, headers: request.headers })) {
    console.error("❌ Invalid Twitch Signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Handle Notification
  if (messageType === "notification") {
    return handleNotification(subscriptionType, body);
  }

  return NextResponse.json({ ok: true, note: "Unhandled message type" });
}