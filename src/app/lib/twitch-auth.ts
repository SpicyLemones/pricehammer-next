// app/lib/twitch-auth.ts
import crypto from "crypto";
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
 * IMPORTANT:
 * For EventSub chat webhooks you must request the NEW bot scopes (NOT legacy chat:read).
 * - user:read:chat
 * - user:bot
 * - channel:bot
 * - moderator:read:chatters (only needed for /chat/chatters)
 */
const TWITCH_SCOPES = [
  "user:read:chat",
  "user:bot",
  "channel:bot",
  "moderator:read:chatters",
  // if you ever want to send messages:
  // "user:write:chat",
].join(" ");

function resolveRedirectUri(request?: Request) {
  const { redirectUri } = getTwitchConfig();
  // Keep this simple + deterministic; Twitch is strict about exact matches.
  // If you want to support multiple environments, set TWITCH_REDIRECT_URI accordingly per env.
  return redirectUri;
}

export function getTwitchConfig(): TwitchConfig {
  const missing: string[] = [];
  if (!process.env.TWITCH_CLIENT_ID) missing.push("TWITCH_CLIENT_ID");
  if (!process.env.TWITCH_CLIENT_SECRET) missing.push("TWITCH_CLIENT_SECRET");
  if (!process.env.TWITCH_REDIRECT_URI) missing.push("TWITCH_REDIRECT_URI");
  if (!process.env.TWITCH_STATE_SECRET) missing.push("TWITCH_STATE_SECRET");

  if (missing.length) {
    throw new Error(
      `Missing Twitch OAuth environment variables: ${missing.join(", ")}`
    );
  }

  return {
    clientId: process.env.TWITCH_CLIENT_ID as string,
    clientSecret: process.env.TWITCH_CLIENT_SECRET as string,
    redirectUri: process.env.TWITCH_REDIRECT_URI as string,
    stateSecret: process.env.TWITCH_STATE_SECRET as string,
  };
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

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: TWITCH_SCOPES,
    state,
    // Helps ensure you actually re-consent after changing scopes while debugging
    force_verify: process.env.NODE_ENV === "production" ? "false" : "true",
  });

  return `${TWITCH_AUTHORIZE_URL}?${params.toString()}`;
}

export function verifyState(state: string) {
  const stateSecret = process.env.TWITCH_STATE_SECRET;
  if (!stateSecret) return { valid: false as const };

  const [nonce, signature, redirectPart] = state.split(".");
  if (!nonce || !signature) return { valid: false as const };

  const expected = signState(nonce, stateSecret);

  // timingSafeEqual throws if lengths differ
  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length) return { valid: false as const };

  const valid = crypto.timingSafeEqual(sigBuf, expBuf);
  const redirect = redirectPart ? decodeURIComponent(redirectPart) : undefined;

  return { valid, redirect } as const;
}

function signState(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function readSession(): Promise<StoredTwitchSession | null> {
  const cookieStore = cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    const session = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    ) as StoredTwitchSession;

    if (!session.accessToken || !session.refreshToken || !session.userId)
      return null;

    return session;
  } catch (error) {
    console.error("Failed to parse Twitch session", error);
    return null;
  }
}

export async function writeSession(session: StoredTwitchSession) {
  const cookieStore = cookies();
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString(
    "base64url"
  );

  cookieStore.set(COOKIE_NAME, encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // allow localhost http
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function clearSession() {
  const cookieStore = cookies();
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

  const tokenResponse = await fetch(
    `${TWITCH_TOKEN_URL}?${tokenParams.toString()}`,
    { method: "POST" }
  );

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(
      `Failed to exchange code: ${tokenResponse.status} ${errorText}`
    );
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const user = await fetchUser(tokenData.access_token);

  // Optional but super useful: log what scopes Twitch thinks you have
  // (If your subscription is 403'ing, this will show if you’re missing user:bot/channel:bot)
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

  const response = await fetch(`${TWITCH_TOKEN_URL}?${params.toString()}`, {
    method: "POST",
  });
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

export async function twitchApi<T>(
  path: string,
  session: StoredTwitchSession,
  init?: RequestInit
): Promise<T> {
  const { clientId } = getTwitchConfig();

  const response = await fetch(`${TWITCH_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Client-Id": clientId,
      ...(init?.headers || {}),
    },
    cache: "no-cache",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twitch API error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
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
 * Register EventSub webhook for chat messages.
 *
 * Backwards-compatible call:
 *   registerChattergroundsWebhook(session.userId)
 * (uses same ID as broadcaster + bot)
 *
 * Recommended (separate bot account):
 *   registerChattergroundsWebhook(broadcasterId, botUserId)
 */
export async function registerChattergroundsWebhook(
  broadcasterId: string,
  botUserId?: string
) {
  const { clientId, clientSecret } = getTwitchConfig();

  const secret = process.env.CHATTERGROUNDS_INGEST_SECRET;
  const callbackUrl =
    process.env.CHATTERGROUNDS_CALLBACK_URL ??
    "https://www.spycy.fun/api/twitch/chattergrounds/ingest";

  if (!secret || secret.length < 16) {
    throw new Error(
      "CHATTERGROUNDS_INGEST_SECRET is missing/too short. Make it a long random string (>= 16 chars)."
    );
  }

  const effectiveBotUserId = botUserId ?? broadcasterId;

  // 1) App access token (required for webhook subscriptions)
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
    throw new Error(
      `Failed to get App Access Token: ${JSON.stringify(tokenData)}`
    );
  }

  // 2) Register the subscription
  const subRes = await fetch(`${TWITCH_API_BASE}/eventsub/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appAccessToken}`,
      "Client-Id": clientId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "channel.chat.message",
      version: "1",
      condition: {
        broadcaster_user_id: broadcasterId,
        user_id: effectiveBotUserId, // must be the "chatting user" / bot user
      },
      transport: {
        method: "webhook",
        callback: callbackUrl,
        secret,
      },
    }),
  });

  const data = await subRes.json();

  console.log(`Twitch EventSub Status: ${subRes.status}`);
  console.log("Twitch Subscription Response:", JSON.stringify(data, null, 2));

  if (!subRes.ok) {
    // This is where your 403 happens. With the new scopes + re-auth, it should stop.
    throw new Error(
      `EventSub subscribe failed ${subRes.status}: ${JSON.stringify(data)}`
    );
  }

  return data;
}

export type TwitchChattersResponse = {
  live: boolean;
  displayName?: string;
  login?: string;
  chatters?: string[];
};

/**
 * Fetch chatters.
 * - If you are using a bot account, pass broadcasterId/moderatorId properly:
 *   fetchChatters(session, { broadcasterId: "CHANNEL_ID", moderatorId: session.userId })
 */
export async function fetchChatters(
  session: StoredTwitchSession,
  opts?: { broadcasterId?: string; moderatorId?: string }
): Promise<TwitchChattersResponse> {
  const broadcasterId = opts?.broadcasterId ?? session.userId;
  const moderatorId = opts?.moderatorId ?? session.userId;

  // Check if stream is live (for the broadcaster)
  const streams = await twitchApi<{ data: Array<{ id: string }> }>(
    `/streams?user_id=${broadcasterId}`,
    session
  );

  if (!streams.data?.length) {
    return { live: false, displayName: session.displayName, login: session.login };
  }

  const chatters = await twitchApi<{
    data: Array<{ user_login: string }>;
  }>(
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
