import { NextRequest } from "next/server";

import { getValidSession } from "@/app/lib/twitch-auth";
import {
  OVERLAY_COOLDOWN_MS,
  createOverlayToken,
  publishOverlayLevelUp,
  subscribeToOverlay,
  verifyOverlayToken,
  verifyOverlaySecret,
} from "./channel";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}

function streamJson(event: any) {
  const data = JSON.stringify(event);
  return `data: ${data}\n\n`;
}

function parseStreamerId(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const streamerId = searchParams.get("streamerId") || searchParams.get("id") || searchParams.get("user");
  return streamerId?.trim() || null;
}

function parseToken(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get("token") || request.headers.get("x-overlay-token") || null;
  return token?.trim() || null;
}

function parseSecret(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const secret = searchParams.get("secret") || request.headers.get("x-overlay-secret") || null;
  return secret?.trim() || null;
}

export async function GET(request: NextRequest) {
  const streamerId = parseStreamerId(request);
  if (!streamerId) return jsonError("missing_streamerId", 400);

  const token = parseToken(request);
  const secret = parseSecret(request);

  const hasCredentials = Boolean(token || secret);
  let auth: { ok: true; expiresAt: number | null } | { ok: false; reason: string };

  if (!hasCredentials) {
    auth = { ok: true, expiresAt: null };
  } else {
    auth = verifyOverlayToken(token, streamerId);
    if (!auth.ok && secret) {
      const secretResult = verifyOverlaySecret(secret, streamerId);
      if (secretResult.ok) {
        auth = { ok: true, expiresAt: secretResult.expiresAt } as const;
      }
    }
  }

  if (!auth.ok) return jsonError(`unauthorized:${auth.reason}`, 401);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const heartbeat = setInterval(() => {
    writer.write(`: ping ${Date.now()}\n\n`);
  }, 25_000);

  const unsubscribe = subscribeToOverlay(streamerId, (event) => {
    writer.write(streamJson(event));
  });

  // a friendly hello for clients
  writer.write(streamJson({ type: "hello", streamerId, expiresAt: auth.expiresAt }));

  const close = () => {
    clearInterval(heartbeat);
    unsubscribe();
    writer.close().catch(() => {});
  };

  request.signal.addEventListener("abort", close, { once: true });

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}

export async function POST(request: NextRequest) {
  const streamerId = parseStreamerId(request);
  if (!streamerId) return jsonError("missing_streamerId", 400);

  const session = await getValidSession();
  if (!session || session.userId !== streamerId) {
    return jsonError("unauthorized", 401);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_json", 400);
  }

  const event = publishOverlayLevelUp(streamerId, body ?? {});
  if (!event.accepted) {
    return jsonError(event.reason ?? "rejected", 429);
  }

  return new Response(JSON.stringify({ ok: true, payload: event.payload, cooldownMs: OVERLAY_COOLDOWN_MS }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function HEAD(request: NextRequest) {
  const streamerId = parseStreamerId(request);
  if (!streamerId) return new Response(null, { status: 400 });

  const session = await getValidSession();
  if (!session || session.userId !== streamerId) return new Response(null, { status: 401 });

  const token = createOverlayToken(streamerId);
  return new Response(null, {
    status: 204,
    headers: {
      "x-overlay-token": token,
      "x-overlay-expires": new Date(Date.now() + 15 * 60_000).toISOString(),
    },
  });
}
