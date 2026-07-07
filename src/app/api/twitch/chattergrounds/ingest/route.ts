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

async function handleNotification(subscriptionType: string, envelope: EventSubEnvelope) {
  const event = envelope.event ?? {};
  const broadcasterId = event.broadcaster_user_id || event.broadcaster_id || event.broadcaster?.user_id;

  if (!broadcasterId) {
    return NextResponse.json({ error: "No broadcaster ID" }, { status: 400 });
  }

  const actions: PersistAction[] = [];

  if (subscriptionType === "channel.chat.message") {
    const chatterId = event.chatter_user_id as string | undefined;
    const chatterLogin = event.chatter_user_login as string | undefined;
    const chatterDisplayName = event.chatter_user_name as string | undefined;
    const text = event.message?.text as string | undefined;

    // real emote names from the message fragments (type "emote")
    const fragments = Array.isArray(event.message?.fragments) ? event.message.fragments : [];
    const emotes = fragments
      .filter((f: any) => f?.type === "emote" && typeof f?.text === "string")
      .map((f: any) => f.text as string);

    if (chatterId && text) {
      actions.push({
        action: "record-message",
        chatterId,
        message: text,
        emotes,
        chatterLogin,
        chatterDisplayName,
      });
    }
  }
  else if (subscriptionType === "channel.ban") {
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
  else if (subscriptionType === "channel.subscribe") {
    const chatterId = event.user_id as string | undefined;
    const chatterLogin = event.user_login as string | undefined;
    const chatterDisplayName = event.user_name as string | undefined;
    const tier = event.tier as string | undefined;

    if (chatterId) {
      actions.push({
        action: "sub-status",
        chatterId,
        chatterLogin,
        chatterDisplayName,
        isSubscriber: true,
        tier,
      });
    }
  }
  else if (subscriptionType === "channel.subscription.message") {
    const chatterId = event.user_id as string | undefined;
    const chatterLogin = event.user_login as string | undefined;
    const chatterDisplayName = event.user_name as string | undefined;
    const tier = event.tier as string | undefined;
    const cumulativeMonths = Number(event.cumulative_months ?? 0);

    if (chatterId && Number.isFinite(cumulativeMonths) && cumulativeMonths > 0) {
      actions.push({
        action: "sub-months",
        chatterId,
        chatterLogin,
        chatterDisplayName,
        months: cumulativeMonths,
        tier,
      });
    } else if (chatterId) {
      actions.push({
        action: "sub-status",
        chatterId,
        chatterLogin,
        chatterDisplayName,
        isSubscriber: true,
        tier,
      });
    }
  }
  else if (subscriptionType === "channel.subscription.gift") {
    const gifterId = event.user_id as string | undefined;
    const gifterLogin = event.user_login as string | undefined;
    const gifterDisplayName = event.user_name as string | undefined;
    const giftCount = Math.max(1, Math.floor(Number(event.total ?? 1)));

    if (gifterId) {
      actions.push({
        action: "gift-subs",
        chatterId: gifterId,
        chatterLogin: gifterLogin,
        chatterDisplayName: gifterDisplayName,
        count: giftCount,
      });
    }

    const recipientId = event.recipient_user_id as string | undefined;
    const recipientLogin = event.recipient_user_login as string | undefined;
    const recipientDisplayName = event.recipient_user_name as string | undefined;
    const recipientTier = event.tier as string | undefined;

    if (recipientId) {
      actions.push({
        action: "sub-status",
        chatterId: recipientId,
        chatterLogin: recipientLogin,
        chatterDisplayName: recipientDisplayName,
        isSubscriber: true,
        tier: recipientTier,
      });
    }
  }
  else if (subscriptionType === "channel.subscription.end") {
    const chatterId = event.user_id as string | undefined;
    const chatterLogin = event.user_login as string | undefined;
    const chatterDisplayName = event.user_name as string | undefined;

    if (chatterId) {
      actions.push({
        action: "sub-status",
        chatterId,
        chatterLogin,
        chatterDisplayName,
        isSubscriber: false,
      });
    }
  }

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

  if (messageType === "webhook_callback_verification") {
    return new Response(body.challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (messageType === "notification") {
    return handleNotification(subscriptionType, body);
  }

  return new Response("OK", { status: 200 });
}
