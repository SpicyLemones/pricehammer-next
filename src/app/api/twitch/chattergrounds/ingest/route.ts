import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { applyChattergroundsAction, getData, type PersistAction } from "@/app/api/twitch/chattergrounds/route";

type EventSubEnvelope = {
  challenge?: string;
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
  if (!secret) return true;

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
    event?.broadcaster_user_id ||
    event?.broadcasterId ||
    event?.broadcaster_id ||
    event?.channel_id ||
    null
  );
}

async function handleNotification(subscriptionType: string, envelope: EventSubEnvelope) {
  const event = envelope.event ?? {};
  const broadcasterId = resolveBroadcasterId(event);
  
  // Cast to string for function compatibility
  const bIdString = typeof broadcasterId === "string" ? broadcasterId : undefined;

  const owner =
    event?.broadcaster_user_id || event?.broadcaster_user_login || event?.broadcaster_user_name
      ? {
          userId: event.broadcaster_user_id,
          login: event.broadcaster_user_login,
          displayName: event.broadcaster_user_name,
        }
      : undefined;

  const actions: PersistAction[] = [];

  if (subscriptionType === "channel.chat.message") {
    const chatterId = event.chatter_user_id ?? event.user_id;
    const text = event.message?.text ?? event.message ?? undefined;
    if (chatterId) {
      actions.push({ action: "record-message", chatterId, message: typeof text === "string" ? text : undefined });
    }
  } else if (subscriptionType === "channel.ban") {
    const chatterId = event.user_id ?? event.target_user_id;
    const isPermanent = event.is_permanent ?? event.permanent ?? event.ban?.is_permanent;
    if (chatterId) {
      actions.push({ action: isPermanent ? "ban" : "timeout", chatterId });
    }
  } else if (subscriptionType === "channel.subscription" || subscriptionType === "channel.subscription.message") {
    const chatterId = event.user_id;
    const months = event.cumulative_months ?? event.total_months ?? event.duration_months;
    if (chatterId && typeof months === "number") {
      actions.push({ action: "sub-months", chatterId, months });
    }
  }

  const results: PersistAction[] = [];
  for (const action of actions) {
    const result = await applyChattergroundsAction(action, {
      sessionUserId: bIdString,
      owner,
      origin: "twitch",
    });
    
    if (result && "error" in result) {
      console.error("Chattergrounds ingest failure", action, result.error);
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    results.push(action);
  }

  if (!actions.length) {
    return NextResponse.json({ ok: true, note: "Event ignored" });
  }

  // FIXED: Passing bIdString directly instead of an object
  const data = await getData(bIdString);
  return NextResponse.json({ ok: true, applied: results, data });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Parse JSON after reading raw text so we can verify the signature
  let body: EventSubEnvelope;
  try {
    body = JSON.parse(rawBody) as EventSubEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messageType = request.headers.get("twitch-eventsub-message-type");
  const subscriptionType = request.headers.get("twitch-eventsub-subscription-type") ?? "";

  // Twitch does not sign the initial verification challenge, so only verify signatures for notifications
  if (messageType === "notification" && !verifyTwitchSignature({ body: rawBody, headers: request.headers })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (messageType === "webhook_callback_verification" && body.challenge) {
    return new Response(body.challenge, { status: 200 });
  }

  if (messageType === "notification") {
    return handleNotification(subscriptionType, body);
  }

  return NextResponse.json({ ok: true, note: "Unhandled message type" });
}
