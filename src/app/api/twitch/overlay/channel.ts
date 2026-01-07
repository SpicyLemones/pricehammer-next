import crypto from "node:crypto";

export const OVERLAY_COOLDOWN_MS = 60_000;

export type OverlayLevelUpPayload = {
  id: string;
  name: string;
  level: number;
  xpToNext: number;
  flair: string;
  color: string;
  message?: string;
  at: string;
};

export type OverlayChatPayload = {
  id: string;
  name: string;
  message: string;
  flair: string;
  color: string;
  at: string;
};

export type OverlayEventEnvelope =
  | { type: "level-up"; payload: OverlayLevelUpPayload }
  | { type: "chat"; payload: OverlayChatPayload };

type Listener = (event: OverlayEventEnvelope) => void;

const subscriberMap = new Map<string, Set<Listener>>();
const cooldowns = new Map<string, Map<string, number>>();

const DEFAULT_GRADIENTS = [
  "from-fuchsia-400 to-sky-400",
  "from-amber-300 to-rose-400",
  "from-emerald-300 to-cyan-400",
  "from-indigo-300 to-purple-500",
  "from-teal-300 to-lime-300",
  "from-blue-300 to-emerald-300",
  "from-orange-300 to-pink-400",
  "from-sky-300 to-purple-400",
];

export function getOverlaySecret(): string {
  const secret = process.env.TWITCH_OVERLAY_SECRET ?? process.env.TWITCH_STATE_SECRET;
  if (!secret) {
    throw new Error("TWITCH_OVERLAY_SECRET or TWITCH_STATE_SECRET must be configured for overlay auth");
  }
  return secret;
}

export function createOverlayToken(streamerId: string, ttlMs = 15 * 60_000) {
  const secret = getOverlaySecret();
  const expiresAt = Date.now() + Math.max(1_000, ttlMs);
  const payload = JSON.stringify({ streamerId, exp: expiresAt });
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  const encodedPayload = Buffer.from(payload).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyOverlayToken(token: string | null | undefined, streamerId: string) {
  if (!token) return { ok: false as const, reason: "missing_token" };

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return { ok: false as const, reason: "invalid_format" };

  let payload: { streamerId?: string; exp?: number };
  try {
    const payloadJson = Buffer.from(encodedPayload, "base64url").toString("utf8");
    payload = JSON.parse(payloadJson);

    const expectedSignature = crypto.createHmac("sha256", getOverlaySecret()).update(payloadJson).digest("hex");
    const providedSig = Buffer.from(signature, "hex");
    const expectedSig = Buffer.from(expectedSignature, "hex");
    if (providedSig.length !== expectedSig.length || !crypto.timingSafeEqual(providedSig, expectedSig)) {
      return { ok: false as const, reason: "invalid_signature" };
    }
  } catch {
    return { ok: false as const, reason: "invalid_payload" };
  }

  if (!payload.streamerId || payload.streamerId !== streamerId) {
    return { ok: false as const, reason: "wrong_streamer" };
  }

  if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
    return { ok: false as const, reason: "expired" };
  }

  return { ok: true as const, expiresAt: payload.exp };
}

export function verifyOverlaySecret(secret: string | null | undefined, streamerId: string) {
  if (!secret) return { ok: false as const, reason: "missing_secret" };
  if (secret !== getOverlaySecret()) return { ok: false as const, reason: "invalid_secret" };

  // Treat a matching secret as short-lived access for the given streamer.
  const expiresAt = Date.now() + 15 * 60_000;
  const payload = JSON.stringify({ streamerId, exp: expiresAt });
  const signature = crypto.createHmac("sha256", getOverlaySecret()).update(payload).digest("hex");
  const encodedPayload = Buffer.from(payload).toString("base64url");

  return {
    ok: true as const,
    expiresAt,
    token: `${encodedPayload}.${signature}`,
  };
}

export function subscribeToOverlay(streamerId: string, listener: Listener) {
  const listeners = subscriberMap.get(streamerId) ?? new Set<Listener>();
  listeners.add(listener);
  subscriberMap.set(streamerId, listeners);

  return () => {
    const current = subscriberMap.get(streamerId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) subscriberMap.delete(streamerId);
  };
}

type IncomingOverlayEvent = {
  id: string;
  name?: string;
  level?: number;
  xpToNext?: number;
  flair?: string;
  color?: string;
  message?: string;
};

function colorFromId(id: string) {
  try {
    const digest = crypto.createHash("sha256").update(id).digest();
    const index = digest[0] % DEFAULT_GRADIENTS.length;
    return DEFAULT_GRADIENTS[index];
  } catch {
    return DEFAULT_GRADIENTS[0];
  }
}

function normalizeEvent(event: IncomingOverlayEvent): OverlayLevelUpPayload {
  const now = new Date().toISOString();
  const trimmedId = (event.id ?? "").trim();

  const name = (event.name ?? event.id ?? "").trim() || "Adventurer";
  const flair = (event.flair ?? "Channel Runner").trim();
  const xpToNextRaw = Number.isFinite(event.xpToNext) ? Number(event.xpToNext) : 25;
  const levelRaw = Number.isFinite(event.level) ? Number(event.level) : 1;
  const message = (event.message ?? "").toString().trim() || undefined;

  return {
    id: trimmedId || crypto.randomUUID(),
    name,
    flair,
    level: Math.max(1, Math.floor(levelRaw)),
    xpToNext: Math.max(1, Math.round(xpToNextRaw)),
    color: (event.color ?? colorFromId(trimmedId || name)).trim() || DEFAULT_GRADIENTS[0],
    message,
    at: now,
  };
}

export function publishOverlayChat(streamerId: string, event: IncomingOverlayEvent) {
  const trimmedId = (event.id ?? "").trim();
  const name = (event.name ?? event.id ?? "").trim() || "Adventurer";
  const message = (event.message ?? "").toString().trim();
  const flair = (event.flair ?? "Channel Runner").trim();
  const color = (event.color ?? colorFromId(trimmedId || name)).trim() || DEFAULT_GRADIENTS[0];

  if (!message) {
    return { accepted: false as const, reason: "empty_message" };
  }

  const payload: OverlayChatPayload = {
    id: trimmedId || crypto.randomUUID(),
    name,
    message,
    flair,
    color,
    at: new Date().toISOString(),
  };

  const listeners = subscriberMap.get(streamerId);
  if (listeners?.size) {
    const envelope: OverlayEventEnvelope = { type: "chat", payload };
    listeners.forEach((listener) => listener(envelope));
  }

  return { accepted: true as const, payload };
}

export function publishOverlayLevelUp(streamerId: string, event: IncomingOverlayEvent) {
  const payload = normalizeEvent(event);
  const now = Date.now();

  const streamerCooldowns = cooldowns.get(streamerId) ?? new Map<string, number>();
  const until = streamerCooldowns.get(payload.id);
  if (until && until > now) {
    return { accepted: false as const, reason: "cooldown", nextAllowedAt: until };
  }

  streamerCooldowns.set(payload.id, now + OVERLAY_COOLDOWN_MS);
  cooldowns.set(streamerId, streamerCooldowns);

  const listeners = subscriberMap.get(streamerId);
  if (listeners?.size) {
    const envelope: OverlayEventEnvelope = { type: "level-up", payload };
    listeners.forEach((listener) => listener(envelope));
  }

  return { accepted: true as const, payload };
}

export function pruneOverlayCooldowns() {
  const now = Date.now();
  for (const [streamerId, entries] of cooldowns.entries()) {
    for (const [id, until] of entries.entries()) {
      if (until <= now) entries.delete(id);
    }
    if (entries.size === 0) cooldowns.delete(streamerId);
  }
}
