import { NextRequest } from "next/server";

import { getValidSession } from "@/app/lib/twitch-auth";
import {
  OVERLAY_COOLDOWN_MS,
  publishOverlayLevelUp,
  subscribeToOverlay,
  verifyOverlayToken,
} from "../../channel";

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

function parseToken(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get("token") || request.headers.get("x-overlay-token") || null;
  return token?.trim() || null;
}

export async function GET(request: NextRequest, { params }: { params: { streamerId: string } }) {
  const streamerId = (params?.streamerId ?? "").trim();
  if (!streamerId) return jsonError("missing_streamerId", 400);

  const token = parseToken(request);
  const auth = verifyOverlayToken(token, streamerId);
  if (!auth.ok) return jsonError(`unauthorized:${auth.reason}`, 401);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const heartbeat = setInterval(() => {
    writer.write(`: ping ${Date.now()}\n\n`);
  }, 25_000);

  const unsubscribe = subscribeToOverlay(streamerId, (event) => {
    writer.write(streamJson(event));
  });

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

export async function POST(request: NextRequest, { params }: { params: { streamerId: string } }) {
  const streamerId = (params?.streamerId ?? "").trim();
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
