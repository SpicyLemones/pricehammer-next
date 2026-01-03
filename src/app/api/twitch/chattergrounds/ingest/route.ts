import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { applyChattergroundsAction, getData, type PersistAction } from "@/app/api/twitch/chattergrounds/route";

type EventSubEnvelope = {
  challenge?: string;
  event?: Record<string, any>;
};

function verifySecret(request: Request) {
  const expected = process.env.CHATTERGROUNDS_INGEST_SECRET;
  if (!expected) return true; // soft allow if no secret configured
  const provided = request.headers.get("x-chattergrounds-secret");
  return Boolean(provided && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected)));
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
      sessionUserId: broadcasterId ?? undefined,
      owner,
      origin: "twitch",
    });
    if ("error" in result) {
      console.error("Chattergrounds ingest failure", action, result.error);
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    results.push(action);
  }

  if (!actions.length) {
    return NextResponse.json({ ok: true, note: "Event ignored (no supported action derived)" });
  }

  const data = await getData({ userId: broadcasterId ?? undefined, owner, origin: "twitch" });
  return NextResponse.json({ ok: true, applied: results, data });
}

export async function POST(request: Request) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: EventSubEnvelope;
  try {
    body = (await request.json()) as EventSubEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messageType = request.headers.get("twitch-eventsub-message-type");
  const subscriptionType = request.headers.get("twitch-eventsub-subscription-type") ?? "";

  if (messageType === "webhook_callback_verification" && body.challenge) {
    return new Response(body.challenge, { status: 200 });
  }

  if (messageType === "notification") {
    return handleNotification(subscriptionType, body);
  }

  return NextResponse.json({ ok: true, note: "Unhandled message type" });
}
