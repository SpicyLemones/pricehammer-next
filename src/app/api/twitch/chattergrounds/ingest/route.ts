import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  applyChattergroundsAction,
  type PersistAction,
} from "@/app/api/twitch/chattergrounds/route";

type EventSubEnvelope = {
  challenge?: string;
  subscription?: { type: string };
  event?: Record<string, any>;
};

function verifyTwitchSignature({ body, headers }: { body: string; headers: Headers }) {
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

function pickBestChatterName(login?: string | null, displayName?: string | null, id?: string | null) {
  // I recommend storing login in your `name` field (stable + nice for URLs)
  // and optionally storing display name separately if you have a column.
  return login || displayName || id || "Unknown";
}

async function handleNotification(subscriptionType: string, envelope: EventSubEnvelope) {
  const event = envelope.event ?? {};

  // Broadcaster ID can vary per event type
  const broadcasterId =
    event.broadcaster_user_id ||
    event.broadcaster_id ||
    event.broadcaster?.user_id;

  if (!broadcasterId) {
    return NextResponse.json({ error: "No broadcaster ID" }, { status: 400 });
  }

  const actions: PersistAction[] = [];

  // --- CHAT MESSAGES ---
  if (subscriptionType === "channel.chat.message") {
    const chatterId = event.chatter_user_id as string | undefined;
    const chatterLogin = event.chatter_user_login as string | undefined; // lowercase login
    const chatterDisplayName = event.chatter_user_name as string | undefined; // display name (caps)

    const text = event.message?.text as string | undefined;

    if (chatterId && text) {
      actions.push({
        action: "record-message",
        chatterId,
        message: text,
        chatterLogin,
        chatterDisplayName,
        // if you ever want it:
        // messageId: event.message_id,
      });
    }
  }

  // --- BANS / TIMEOUTS ---
  else if (subscriptionType === "channel.ban") {
    // channel.ban event commonly uses: user_id, user_login, user_name
    const chatterId = event.user_id as string | undefined;
    const chatterLogin = event.user_login as string | undefined;
    const chatterDisplayName = event.user_name as string | undefined;

    if (chatterId) {
      actions.push({
        action: event.is_permanent ? "ban" : "timeout",
        chatterId,
        chatterLogin,
        chatterDisplayName,
      });
    }
  }

  // Execute Database Actions
  for (const action of actions) {
    // Optional: ensure a name exists even if Twitch didn’t send it for some reason
    if (action.chatterId && !action.chatterLogin && !action.chatterDisplayName) {
      // no-op; keep as-is
    }

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

  // 1) Verify signature (applies to challenge + notifications)
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
  const subscriptionType =
    headers.get("twitch-eventsub-subscription-type") ??
    body.subscription?.type ??
    "";

  // 2) Verification handshake
  if (messageType === "webhook_callback_verification") {
    console.log("✅ Responding to Twitch Verification Challenge");
    return new Response(body.challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // 3) Data notification
  if (messageType === "notification") {
    return handleNotification(subscriptionType, body);
  }

  // Nice to handle these explicitly (optional)
  if (messageType === "revocation") {
    console.warn("⚠️ Twitch subscription revoked:", subscriptionType);
    return NextResponse.json({ ok: true, revoked: true });
  }

  return new Response("OK", { status: 200 });
}
