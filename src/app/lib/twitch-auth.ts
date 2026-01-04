// app/lib/twitch-auth.ts
import crypto from "node:crypto";
import { cookies } from "next/headers";

type StoredTwitchSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  login: string;
  displayName: string;
};

export type TwitchConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
};

const COOKIE_NAME = "twitch_auth";

const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";
const TWITCH_API_BASE = "https://api.twitch.tv/helix";

/**
 * Scope presets
 *
 * Control with:
 * - TWITCH_SCOPE_PRESET=minimal|standard|power
 * OR
 * - TWITCH_SCOPES="space separated scopes" (hard override)
 */
const SCOPE_PRESETS: Record<"minimal" | "standard" | "power", string[]> = {
  minimal: [
    // channel.chat.message auth requirements (chatting user + bot)
    "user:read:chat",
    "user:bot",
    "channel:bot",

    // /chat/chatters
    "moderator:read:chatters",

    // channel.ban EventSub requires channel:moderate (user token)
    "channel:moderate",
  ],

  standard: [
    "user:read:chat",
    "user:bot",
    "channel:bot",
    "moderator:read:chatters",
    "channel:moderate",

    // common read scopes
    "bits:read",
    "user:read:email",
    "channel:read:subscriptions",
    "channel:read:redemptions",
    "channel:read:polls",
    "channel:read:predictions",
    "channel:read:hype_train",
    "channel:read:goals",
    "channel:read:vips",
    "moderation:read",
    "moderator:read:banned_users",
    "moderator:read:chat_messages",
    "moderator:read:followers",
    "moderator:read:moderators",
  ],

  power: [
    // Standard
    "user:read:chat",
    "user:bot",
    "channel:bot",
    "moderator:read:chatters",
    "channel:moderate",
    "bits:read",
    "user:read:email",
    "channel:read:subscriptions",
    "channel:read:redemptions",
    "channel:read:polls",
    "channel:read:predictions",
    "channel:read:hype_train",
    "channel:read:goals",
    "channel:read:vips",
    "moderation:read",
    "moderator:read:banned_users",
    "moderator:read:chat_messages",
    "moderator:read:followers",
    "moderator:read:moderators",

    // Write / manage (broad)
    "user:write:chat",
    "moderator:manage:announcements",
    "moderator:manage:automod",
    "moderator:manage:banned_users",
    "moderator:manage:blocked_terms",
    "moderator:manage:chat_messages",
    "moderator:manage:chat_settings",
    "moderator:manage:shield_mode",
    "moderator:manage:shoutouts",
    "moderator:manage:unban_requests",

    "channel:manage:ads",
    "channel:read:ads",
    "channel:manage:broadcast",
    "channel:edit:commercial",
    "channel:manage:moderators",
    "channel:manage:polls",
    "channel:manage:predictions",
    "channel:manage:redemptions",
    "channel:manage:raids",
    "channel:manage:schedule",
    "channel:manage:vips",
    "channel:manage:videos",
    "channel:manage:extensions",

    // Clips
    "clips:edit",
  ],
};

function dedupeScopes(scopes: string[]) {
  const set = new Set<string>();
  for (const s of scopes) {
    const t = (s ?? "").trim();
    if (t) set.add(t);
  }
  return Array.from(set);
}

function getOAuthScopes(): string {
  // Hard override: TWITCH_SCOPES="a b c"
  const override = (process.env.TWITCH_SCOPES ?? "").trim();
  if (override) return dedupeScopes(override.split(/\s+/)).join(" ");

  const preset = ((process.env.TWITCH_SCOPE_PRESET ?? "standard").trim() as
    | "minimal"
    | "standard"
    | "power");

  const scopes = SCOPE_PRESETS[preset] ?? SCOPE_PRESETS.standard;
  return dedupeScopes(scopes).join(" ");
}

function resolveRedirectUri(_request?: Request) {
  const { redirectUri } = getTwitchConfig();
  return redirectUri;
}

export function getTwitchConfig(): TwitchConfig {
  const missing: string[] = [];
  if (!process.env.TWITCH_CLIENT_ID) missing.push("TWITCH_CLIENT_ID");
  if (!process.env.TWITCH_CLIENT_SECRET) missing.push("TWITCH_CLIENT_SECRET");
  if (!process.env.TWITCH_REDIRECT_URI) missing.push("TWITCH_REDIRECT_URI");
  if (!process.env.TWITCH_STATE_SECRET) missing.push("TWITCH_STATE_SECRET");

  if (missing.length) {
    throw new Error(`Missing Twitch OAuth environment variables: ${missing.join(", ")}`);
  }

  return {
    clientId: process.env.TWITCH_CLIENT_ID as string,
    clientSecret: process.env.TWITCH_CLIENT_SECRET as string,
    redirectUri: process.env.TWITCH_REDIRECT_URI as string,
    stateSecret: process.env.TWITCH_STATE_SECRET as string,
  };
}

function signState(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function buildTwitchAuthUrl(redirect?: string, request?: Request) {
  const { clientId, stateSecret } = getTwitchConfig();
  const redirectUri = resolveRedirectUri(request);

  const nonce = crypto.randomBytes(16).toString("hex");
  const cleanedRedirect = redirect && redirect.startsWith("/") ? redirect : "";

  const signature = signState(nonce, stateSecret);
  const state = cleanedRedirect
    ? `${nonce}.${signature}.${encodeURIComponent(cleanedRedirect)}`
    : `${nonce}.${signature}`;

  const scopes = getOAuthScopes();

  // Force re-consent while debugging scopes:
  const forceVerifyEnv = (process.env.TWITCH_FORCE_VERIFY ?? "").trim().toLowerCase();
  const force_verify =
    forceVerifyEnv === "true"
      ? "true"
      : forceVerifyEnv === "false"
      ? "false"
      : process.env.NODE_ENV === "production"
        ? "false"
        : "true";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    state,
    force_verify,
  });

  return `${TWITCH_AUTHORIZE_URL}?${params.toString()}`;
}

export function verifyState(state: string) {
  const stateSecret = process.env.TWITCH_STATE_SECRET;
  if (!stateSecret) return { valid: false as const };

  const [nonce, signature, redirectPart] = state.split(".");
  if (!nonce || !signature) return { valid: false as const };

  const expected = signState(nonce, stateSecret);

  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length) return { valid: false as const };

  const valid = crypto.timingSafeEqual(sigBuf, expBuf);
  const redirect = redirectPart ? decodeURIComponent(redirectPart) : undefined;

  return { valid, redirect } as const;
}

export async function readSession(): Promise<StoredTwitchSession | null> {
  // IMPORTANT: Next may return cookies() as a Promise in your setup — await it.
  const cookieStore: any = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    const session = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as StoredTwitchSession;
    if (!session.accessToken || !session.refreshToken || !session.userId) return null;
    return session;
  } catch (error) {
    console.error("Failed to parse Twitch session", error);
    return null;
  }
}

export async function writeSession(session: StoredTwitchSession) {
  const cookieStore: any = await cookies();
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");

  cookieStore.set(COOKIE_NAME, encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  const cookieStore: any = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function exchangeCodeForTokens(code: string, request?: Request) {
  const { clientId, clientSecret } = getTwitchConfig();
  const redirectUri = resolveRedirectUri(request);

  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const tokenResponse = await fetch(`${TWITCH_TOKEN_URL}?${tokenParams.toString()}`, { method: "POST" });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to exchange code: ${tokenResponse.status} ${errorText}`);
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const user = await fetchUser(tokenData.access_token);

  // Debug: log scopes Twitch thinks you have
  try {
    const validation = await validateUserToken(tokenData.access_token);
    console.log("Twitch token scopes:", validation.scopes);
  } catch (e) {
    console.warn("Failed to validate Twitch token (non-fatal):", e);
  }

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
    userId: user.id,
    login: user.login,
    displayName: user.display_name,
  } satisfies StoredTwitchSession;
}

export async function refreshTokens(session: StoredTwitchSession) {
  const { clientId, clientSecret } = getTwitchConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
  });

  const response = await fetch(`${TWITCH_TOKEN_URL}?${params.toString()}`, { method: "POST" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to refresh token: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const updated: StoredTwitchSession = {
    ...session,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  await writeSession(updated);
  return updated;
}

async function fetchUser(accessToken: string) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) throw new Error("Missing TWITCH_CLIENT_ID");

  const response = await fetch(`${TWITCH_API_BASE}/users`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
    cache: "no-cache",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch Twitch user: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    data: Array<{ id: string; login: string; display_name: string }>;
  };

  if (!data.data?.length) throw new Error("No user info returned from Twitch");
  return data.data[0];
}

export async function getValidSession() {
  const session = await readSession();
  if (!session) return null;

  // refresh 60s early
  if (Date.now() < session.expiresAt - 60_000) return session;

  try {
    return await refreshTokens(session);
  } catch (error) {
    console.error("Failed to refresh Twitch tokens", error);
    await clearSession();
    return null;
  }
}

export async function twitchApi<T>(path: string, session: StoredTwitchSession, init?: RequestInit): Promise<T> {
  const { clientId } = getTwitchConfig();

  const res = await fetch(`${TWITCH_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Client-Id": clientId,
      ...(init?.headers || {}),
    },
    cache: "no-cache",
  });

  if (!res.ok) {
    const text = await res.text();

    // If token got revoked/expired unexpectedly, try a single refresh+retry
    if (res.status === 401) {
      try {
        const refreshed = await refreshTokens(session);
        const retry = await fetch(`${TWITCH_API_BASE}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${refreshed.accessToken}`,
            "Client-Id": clientId,
            ...(init?.headers || {}),
          },
          cache: "no-cache",
        });

        if (!retry.ok) {
          const retryText = await retry.text();
          throw new Error(`Twitch API error ${retry.status}: ${retryText}`);
        }

        return (await retry.json()) as T;
      } catch (e) {
        await clearSession();
        throw new Error(`Twitch API error 401 (token invalid, cleared session): ${text}`);
      }
    }

    throw new Error(`Twitch API error ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

/**
 * Validate user token (handy for debugging missing scopes)
 */
export async function validateUserToken(accessToken: string) {
  const res = await fetch(TWITCH_VALIDATE_URL, {
    headers: { Authorization: `OAuth ${accessToken}` },
    cache: "no-cache",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token validate failed ${res.status}: ${text}`);
  }

  return (await res.json()) as {
    client_id: string;
    login: string;
    user_id: string;
    scopes: string[];
    expires_in: number;
  };
}

/**
 * Register EventSub webhooks for Chattergrounds.
 *
 * - channel.chat.message can be created with an app token (client_credentials),
 *   but it still depends on the app being authorized with the right bot scopes. :contentReference[oaicite:3]{index=3}
 * - channel.ban REQUIRES a USER token with channel:moderate. :contentReference[oaicite:4]{index=4}
 *
 * Usage:
 *   const session = await getValidSession();
 *   await registerChattergroundsWebhook(session!.userId, undefined, session!);
 *
 * If you have a separate bot account:
 *   await registerChattergroundsWebhook(broadcasterId, botUserId, broadcasterSession)
 */
export async function registerChattergroundsWebhook(
  broadcasterId: string,
  botUserId?: string,
  broadcasterSessionForUserScopedSubs?: StoredTwitchSession
) {
  const { clientId, clientSecret } = getTwitchConfig();

  const secret = process.env.CHATTERGROUNDS_INGEST_SECRET;
  const callbackUrl =
    process.env.CHATTERGROUNDS_CALLBACK_URL ??
    "https://www.spycy.fun/api/twitch/chattergrounds/ingest";

  if (!secret || secret.length < 16) {
    throw new Error("CHATTERGROUNDS_INGEST_SECRET is missing/too short. Use a long random string (>= 16 chars).");
  }

  const effectiveBotUserId = botUserId ?? broadcasterId;

  // App token (client_credentials) – OK for channel.chat.message creation
  const tokenRes = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  const tokenData = await tokenRes.json();
  const appAccessToken = tokenData.access_token as string | undefined;

  if (!appAccessToken) {
    throw new Error(`Failed to get App Access Token: ${JSON.stringify(tokenData)}`);
  }

  async function createSub(token: string, body: any) {
    const subRes = await fetch(`${TWITCH_API_BASE}/eventsub/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await subRes.json();
    console.log(`Twitch EventSub(${body.type}) Status: ${subRes.status}`);
    console.log(`Twitch Subscription(${body.type}) Response:`, JSON.stringify(data, null, 2));

    if (!subRes.ok) {
      throw new Error(`EventSub subscribe failed (${body.type}) ${subRes.status}: ${JSON.stringify(data)}`);
    }

    return data;
  }

  const results: Record<string, any> = {};

  // 1) channel.chat.message (app token)
  results["channel.chat.message"] = await createSub(appAccessToken, {
    type: "channel.chat.message",
    version: "1",
    condition: {
      broadcaster_user_id: broadcasterId,
      user_id: effectiveBotUserId,
    },
    transport: {
      method: "webhook",
      callback: callbackUrl,
      secret,
    },
  });

  // 2) channel.ban (USER token with channel:moderate required)
  if (!broadcasterSessionForUserScopedSubs?.accessToken) {
    results["channel.ban"] = {
      ok: false,
      skipped: true,
      reason: "No broadcaster user session provided (required for channel.ban because it needs channel:moderate).",
    };
  } else {
    results["channel.ban"] = await createSub(broadcasterSessionForUserScopedSubs.accessToken, {
      type: "channel.ban",
      version: "1",
      condition: {
        broadcaster_user_id: broadcasterId,
      },
      transport: {
        method: "webhook",
        callback: callbackUrl,
        secret,
      },
    });
  }

  return results;
}

export type TwitchChattersResponse = {
  live: boolean;
  displayName?: string;
  login?: string;
  chatters?: string[];
};

export async function fetchChatters(
  session: StoredTwitchSession,
  opts?: { broadcasterId?: string; moderatorId?: string }
): Promise<TwitchChattersResponse> {
  const broadcasterId = opts?.broadcasterId ?? session.userId;
  const moderatorId = opts?.moderatorId ?? session.userId;

  // Check if stream is live
  const streams = await twitchApi<{ data: Array<{ id: string }> }>(
    `/streams?user_id=${broadcasterId}`,
    session
  );

  if (!streams.data?.length) {
    return { live: false, displayName: session.displayName, login: session.login };
  }

  const chatters = await twitchApi<{ data: Array<{ user_login: string }> }>(
    `/chat/chatters?broadcaster_id=${broadcasterId}&moderator_id=${moderatorId}`,
    session
  );

  return {
    live: true,
    displayName: session.displayName,
    login: session.login,
    chatters: chatters.data?.map((c) => c.user_login) ?? [],
  };
}
