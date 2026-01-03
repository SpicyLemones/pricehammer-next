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
const TWITCH_API_BASE = "https://api.twitch.tv/helix";

function resolveRedirectUri(request?: Request) {
  const { redirectUri } = getTwitchConfig();
  if (!request) return redirectUri;

  try {
    const envUrl = new URL(redirectUri);
    return envUrl.toString();
  } catch (error) {
    console.error("Failed to align Twitch redirect URI", error);
    return redirectUri;
  }
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

export function buildTwitchAuthUrl(redirect?: string, request?: Request) {
  const { clientId, stateSecret } = getTwitchConfig();
  const redirectUri = resolveRedirectUri(request);

  const nonce = crypto.randomBytes(16).toString("hex");
  const cleanedRedirect = redirect && redirect.startsWith("/") ? redirect : "";
  const state = cleanedRedirect
    ? `${nonce}.${signState(nonce, stateSecret)}.${encodeURIComponent(cleanedRedirect)}`
    : `${nonce}.${signState(nonce, stateSecret)}`;

  const params = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  // REQUIRED: user:read:chat
  scope: "chat:read moderator:read:chatters user:read:chat", 
  state,
});

  return `${TWITCH_AUTHORIZE_URL}?${params.toString()}`;
}

export async function registerChattergroundsWebhook(broadcasterId: string, userAccessToken: string) {
  const { clientId } = getTwitchConfig();
  const secret = process.env.CHATTERGROUNDS_INGEST_SECRET;
  
  // Verify this URL matches exactly where your POST ingest route is located
  const callbackUrl = "https://www.spycy.fun/api/twitch/chattergrounds/ingest";

  if (!secret || secret.length < 10 || secret.length > 100) {
    console.error("❌ EventSub Error: CHATTERGROUNDS_INGEST_SECRET must be between 10-100 characters.");
    return { error: "Invalid Secret" };
  }

  try {
    const subRes = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${userAccessToken}`, 
        "Client-Id": clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "channel.chat.message",
        version: "1",
        condition: {
          broadcaster_user_id: broadcasterId,
          user_id: broadcasterId, 
        },
        transport: {
          method: "webhook",
          callback: callbackUrl,
          secret: secret,
        },
      }),
    });

    const data = await subRes.json();
    
    // This will tell us if Twitch accepted the request or why it failed (400, 401, 403, etc.)
    console.log(`Twitch EventSub Status: ${subRes.status}`);
    console.log("Twitch Subscription Response:", JSON.stringify(data, null, 2));

    return data;
  } catch (err) {
    console.error("Failed to register EventSub:", err);
    return { error: "Fetch failed" };
  }
}

export function verifyState(state: string) {
  const stateSecret = process.env.TWITCH_STATE_SECRET;
  if (!stateSecret) return { valid: false };

  const [nonce, signature, redirectPart] = state.split(".");
  if (!nonce || !signature) return { valid: false };

  const expected = signState(nonce, stateSecret);
  const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  const redirect = redirectPart ? decodeURIComponent(redirectPart) : undefined;

  return { valid, redirect };
}

function signState(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function readSession(): Promise<StoredTwitchSession | null> {
  const cookieStore = await cookies();
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
  const cookieStore = await cookies();
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  cookieStore.set(COOKIE_NAME, encoded, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
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

  const tokenResponse = await fetch(`${TWITCH_TOKEN_URL}?${tokenParams.toString()}`, {
    method: "POST",
  });

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
    throw new Error(`Failed to refresh token: ${response.status}`);
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

  const data = (await response.json()) as { data: Array<{ id: string; login: string; display_name: string }> };
  if (!data.data?.length) throw new Error("No user info returned from Twitch");
  return data.data[0];
}

export async function getValidSession() {
  const session = await readSession();
  if (!session) return null;
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
      "Content-Type": "application/json",
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

export type TwitchChattersResponse = {
  live: boolean;
  displayName?: string;
  login?: string;
  chatters?: string[];
};

export async function fetchChatters(session: StoredTwitchSession): Promise<TwitchChattersResponse> {
  // Check if stream is live
  const streams = await twitchApi<{ data: Array<{ id: string }> }>(
    `/streams?user_id=${session.userId}`,
    session
  );

  if (!streams.data?.length) {
    return { live: false, displayName: session.displayName, login: session.login };
  }

  const chatters = await twitchApi<{
    data: Array<{ user_login: string }>;
  }>(`/chat/chatters?broadcaster_id=${session.userId}&moderator_id=${session.userId}`, session);

  return {
    live: true,
    displayName: session.displayName,
    login: session.login,
    chatters: chatters.data?.map((c) => c.user_login) ?? [],
  };
}
