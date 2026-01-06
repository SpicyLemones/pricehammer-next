import { NextResponse } from "next/server";
import { fetchChatters, getTwitchConfig, getValidSession } from "@/app/lib/twitch-auth";
import { run, get, all } from "@/app/lib/sql";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

type RangeKey = "today" | "week" | "month" | "all";
type MessagePoint = { timestamp: string; messages: number };

type ChatterIdentity = {
  chatterId: string;
  chatterLogin?: string;
  chatterDisplayName?: string;
};

// REFACTORED: actions now favor 'xp' terminology
export type PersistAction =
  | (ChatterIdentity & { action: "mint"; amount: number })
  | (ChatterIdentity & { action: "record-message"; message?: string })
  | (ChatterIdentity & { action: "ban" })
  | (ChatterIdentity & { action: "timeout" })
  | (ChatterIdentity & { action: "quest-completed"; amount?: number })

  // Set/refresh cumulative months (max) + implicitly subbed
  | (ChatterIdentity & { action: "sub-months"; months: number; tier?: string })

  // Track “gifter gave N gifted subs to broadcaster”
  | (ChatterIdentity & { action: "gift-subs"; count: number })

  // Track active sub state (true on subscribe/resub, false on end)
  | (ChatterIdentity & { action: "sub-status"; isSubscriber: boolean; tier?: string; months?: number });


type ApplyContext = {
  sessionUserId?: string;
  owner?: { userId?: string; login?: string; displayName?: string };
  origin?: string;
};

async function readSql(filename: string) {
  const sqlPath = path.join(process.cwd(), "data", "db", "queries", "chattergrounds", filename);
  return await fs.readFile(sqlPath, "utf8");
}

let schemaReadyPromise: Promise<void> | null = null;
async function ensureChattergroundsSchema() {
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    const initSql = await readSql("init.sql");
    await run(initSql);

    const migrations = [
      // 1. Ensure estimated age exists
      "ALTER TABLE chattergrounds_stats ADD COLUMN estimated_age INTEGER DEFAULT 0",
      // 2. Ensure favorite word exists
      "ALTER TABLE chattergrounds_stats ADD COLUMN favorite_word TEXT",
      // 3. Ensure favorite emote exists
      "ALTER TABLE chattergrounds_stats ADD COLUMN favorite_emote TEXT",
      // 4. THE CRITICAL RENAME: Change minted to xp (using a try/catch since it might already be renamed)
      "ALTER TABLE chattergrounds_stats RENAME COLUMN toadcoins_minted TO xp",
      // 5. Ensure the spendable toadcoins column exists
      "ALTER TABLE chattergrounds_stats ADD COLUMN toadcoins INTEGER DEFAULT 0",
      "ALTER TABLE chattergrounds_stats ADD COLUMN donos_gifted INTEGER DEFAULT 0",
      "ALTER TABLE chattergrounds_stats ADD COLUMN is_subscriber INTEGER DEFAULT 0",
      "ALTER TABLE chattergrounds_stats ADD COLUMN sub_tier TEXT",
    ];

    for (const sql of migrations) {
      try {
        await run(sql);
      } catch (err: any) {
        // Silently catch errors where column already exists or rename already happened
      }
    }

    await run(`
      CREATE TABLE IF NOT EXISTS chattergrounds_pulse (
        broadcaster_id TEXT NOT NULL,
        bucket_start INTEGER NOT NULL,
        messages INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (broadcaster_id, bucket_start)
      );
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_chattergrounds_pulse_broadcaster_bucket
      ON chattergrounds_pulse(broadcaster_id, bucket_start);
    `);
  })();

  return schemaReadyPromise;
}

async function getRandomJokeTrait() {
  try {
    const configPath = path.join(process.cwd(), "data", "chattergrounds_config.json");
    const file = await fs.readFile(configPath, "utf8");
    const { jokeWords, jokeEmotes } = JSON.parse(file);

    return {
      word: jokeWords[Math.floor(Math.random() * jokeWords.length)],
      emote: jokeEmotes[Math.floor(Math.random() * jokeEmotes.length)],
      age: Math.floor(Math.random() * (80 - 12 + 1)) + 12,
    };
  } catch {
    return { word: "Toad", emote: "Kappa", age: 25 };
  }
}

function resolveStoredName(payload: PersistAction) {
  return payload.chatterLogin || payload.chatterDisplayName || payload.chatterId;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const LIVE_CACHE_TTL_MS = 30_000;

type LiveCacheEntry = { status: boolean | null; expiresAt: number };

let appAccessTokenCache: { token: string; expiresAt: number } | null = null;
const liveStatusCache = new Map<string, LiveCacheEntry>();

async function getAppAccessToken(): Promise<string | null> {
  try {
    const now = Date.now();
    if (appAccessTokenCache && appAccessTokenCache.expiresAt > now + 60_000) {
      return appAccessTokenCache.token;
    }

    const { clientId, clientSecret } = getTwitchConfig();
    const res = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("Failed to fetch app access token for live check", res.status);
      return null;
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;

    const expiresAt = now + Math.max(0, Number(json.expires_in || 0) * 1000);
    appAccessTokenCache = { token: json.access_token, expiresAt };
    return json.access_token;
  } catch (error) {
    console.error("Failed to resolve app access token", error);
    return null;
  }
}

async function isBroadcasterLive(broadcasterId: string): Promise<boolean | null> {
  try {
    const cached = liveStatusCache.get(broadcasterId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.status;
    }

    const token = await getAppAccessToken();
    if (!token) {
      liveStatusCache.set(broadcasterId, { status: null, expiresAt: now + LIVE_CACHE_TTL_MS });
      return null;
    }

    const { clientId } = getTwitchConfig();
    const res = await fetch(
      `https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(broadcasterId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": clientId,
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      console.error("Live check failed", res.status);
      liveStatusCache.set(broadcasterId, { status: null, expiresAt: now + LIVE_CACHE_TTL_MS });
      return null;
    }

    const json = (await res.json().catch(() => null)) as any;
    const live = Array.isArray(json?.data) && json.data.length > 0;
    liveStatusCache.set(broadcasterId, { status: live, expiresAt: now + LIVE_CACHE_TTL_MS });
    return live;
  } catch (error) {
    console.error("Error checking live status", error);
    liveStatusCache.set(broadcasterId, { status: null, expiresAt: Date.now() + LIVE_CACHE_TTL_MS });
    return null;
  }
}

function alignDown(ms: number, step: number) {
  return Math.floor(ms / step) * step;
}

function fillBuckets(
  startMs: number,
  endMs: number,
  stepMs: number,
  rows: Array<{ bucket_start: number; messages: number }>
): MessagePoint[] {
  const map = new Map<number, number>();
  for (const r of rows) {
    const k = Number(r.bucket_start);
    map.set(k, Number(r.messages) || 0);
  }

  const start = alignDown(startMs, stepMs);
  const end = alignDown(endMs, stepMs);

  const points: MessagePoint[] = [];
  for (let t = start; t <= end; t += stepMs) {
    points.push({ timestamp: new Date(t).toISOString(), messages: map.get(t) ?? 0 });
  }

  if (points.length <= 1) {
    const now = alignDown(Date.now(), stepMs);
    return [
      { timestamp: new Date(now - stepMs).toISOString(), messages: 0 },
      { timestamp: new Date(now).toISOString(), messages: 0 },
    ];
  }

  return points;
}

async function getMessageSeries(broadcasterId: string): Promise<Record<RangeKey, MessagePoint[]>> {
  const now = Date.now();
  const todayStart = now - 60 * MINUTE_MS;
  const weekStart = now - 7 * 24 * HOUR_MS;
  const monthStart = now - 30 * DAY_MS;

  const minRow = await get(
    "SELECT MIN(bucket_start) AS min_bucket FROM chattergrounds_pulse WHERE broadcaster_id = ?",
    [broadcasterId]
  );

  const minBucket = Number(minRow?.min_bucket ?? 0);
  const capAllStart = now - 730 * DAY_MS;
  const allStart = minBucket > 0 ? Math.max(minBucket, capAllStart) : capAllStart;

  const todayRows = await all(`SELECT bucket_start, messages FROM chattergrounds_pulse WHERE broadcaster_id = ? AND bucket_start >= ? ORDER BY bucket_start ASC`, [broadcasterId, alignDown(todayStart, MINUTE_MS)]);
  const weekRows = await all(`SELECT (CAST(bucket_start / ${HOUR_MS} AS INTEGER) * ${HOUR_MS}) AS bucket_start, SUM(messages) AS messages FROM chattergrounds_pulse WHERE broadcaster_id = ? AND bucket_start >= ? GROUP BY 1 ORDER BY 1 ASC`, [broadcasterId, alignDown(weekStart, HOUR_MS)]);
  const monthRows = await all(`SELECT (CAST(bucket_start / ${DAY_MS} AS INTEGER) * ${DAY_MS}) AS bucket_start, SUM(messages) AS messages FROM chattergrounds_pulse WHERE broadcaster_id = ? AND bucket_start >= ? GROUP BY 1 ORDER BY 1 ASC`, [broadcasterId, alignDown(monthStart, DAY_MS)]);
  const allRows = await all(`SELECT (CAST(bucket_start / ${DAY_MS} AS INTEGER) * ${DAY_MS}) AS bucket_start, SUM(messages) AS messages FROM chattergrounds_pulse WHERE broadcaster_id = ? AND bucket_start >= ? GROUP BY 1 ORDER BY 1 ASC`, [broadcasterId, alignDown(allStart, DAY_MS)]);

  return {
    today: fillBuckets(todayStart, now, MINUTE_MS, todayRows),
    week: fillBuckets(weekStart, now, HOUR_MS, weekRows),
    month: fillBuckets(monthStart, now, DAY_MS, monthRows),
    all: fillBuckets(allStart, now, DAY_MS, allRows),
  };
}

function normalizeSqlTimestamp(ts: unknown) {
  if (typeof ts !== "string" || !ts) return null;
  if (ts.includes(" ") && !ts.includes("T")) {
    return new Date(ts.replace(" ", "T") + "Z").toISOString();
  }
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function applyChattergroundsAction(
  payload: PersistAction,
  context: ApplyContext = {}
) {
  const broadcasterId = context.sessionUserId || "system";
  const requiresLive =
    payload.action === "record-message" ||
    payload.action === "quest-completed" ||
    payload.action === "mint";

  if (requiresLive) {
    const live = await isBroadcasterLive(broadcasterId);
    if (live !== true) {
      return { skipped: true, reason: "Broadcaster is not live" };
    }
  }

  // Base increments
  let msgs = 0;
  let bans = 0;
  let timeouts = 0;
  let quests = 0;

  // Cumulative months (we store MAX in DB)
  let newCumulativeMonths: number | null = null;

  // Gifted subs given by this user (increment)
  let giftedSubsCount = 0;

  // Current subscriber status: null means "don't change"
  let isSubscriberDesired: boolean | null = null;

  // Optional tier update: null means "don't change"
  let subTier: string | null = null;

  // Economy
  let coinsEarned = 0;
  let xpEarned = 0;

  let msgText: string | null = null;

  // Rate Constants
  const COINS_PER_MSG = 5;
  const XP_RATIO = 0.85;

  // ---- Decide action effects (NO DB reads yet) ----
  if (payload.action === "record-message") {
    msgs = 1;
    msgText = payload.message?.slice(0, 240) || null;

    coinsEarned = COINS_PER_MSG;
    xpEarned = COINS_PER_MSG * XP_RATIO;
  } else if (payload.action === "quest-completed") {
    quests = 1;
    const baseReward = payload.amount || 500;

    coinsEarned = baseReward;
    xpEarned = baseReward * XP_RATIO;
  } else if (payload.action === "ban") {
    bans = 1;
  } else if (payload.action === "timeout") {
    timeouts = 1;
  } else if (payload.action === "mint") {
    coinsEarned = payload.amount;
    xpEarned = payload.amount * XP_RATIO;
  } else if (payload.action === "sub-months") {
    // CUMULATIVE months (store MAX)
    newCumulativeMonths = Math.max(0, Math.floor(payload.months || 0));
    // If we’re seeing months, they’re subbed (at least at the time of the event)
    isSubscriberDesired = true;
    subTier = payload.tier ?? null;
  } else if (payload.action === "gift-subs") {
    // Gifted subs given by this user
    giftedSubsCount = Math.max(0, Math.floor(payload.count || 0));
  } else if (payload.action === "sub-status") {
    isSubscriberDesired = !!payload.isSubscriber;
    if (typeof payload.months === "number") {
      newCumulativeMonths = Math.max(0, Math.floor(payload.months || 0));
    }
    if (typeof payload.tier === "string") {
      subTier = payload.tier;
    }
  }

  const storedName = resolveStoredName(payload);
  const traits = await getRandomJokeTrait();

  try {
    await ensureChattergroundsSchema();

    // ---- Read existing values ONCE (for delta XP + preserving is_subscriber) ----
    // Requires you to have added is_subscriber column via init.sql or migrations.
    const existing = await get(
      "SELECT months_subbed, is_subscriber FROM chattergrounds_stats WHERE broadcaster_id = ? AND chatter_id = ?",
      [broadcasterId, payload.chatterId]
    );

    const currentMonths = Number(existing?.months_subbed ?? 0);
    const currentIsSubscriber = Number(existing?.is_subscriber ?? 0) === 1;

    // XP for sub months: award only for the increase since last seen
    let monthsToStore = 0;
    if (newCumulativeMonths !== null) {
      monthsToStore = newCumulativeMonths;
    }

    // Preserve is_subscriber unless explicitly set by event
    const finalIsSubscriber =
      isSubscriberDesired === null ? currentIsSubscriber : isSubscriberDesired;

    if (finalIsSubscriber) {
      if (coinsEarned > 0) coinsEarned = Math.round(coinsEarned * 1.05);
      if (xpEarned > 0) xpEarned *= 1.05; // XP can stay float
    }

    const upsertSql = await readSql("upsert_stats.sql");

    // NOTE: This param order must match your upsert_stats.sql placeholders.
    // Expected columns: donos_gifted, is_subscriber, sub_tier exist.
    await run(upsertSql, [
      broadcasterId,
      payload.chatterId,
      storedName,
      msgs,
      bans,
      timeouts,
      monthsToStore,       // months_subbed (cumulative; SQL uses MAX)
      quests,
      coinsEarned,         // toadcoins
      xpEarned,            // xp
      giftedSubsCount,     // donos_gifted (increment)
      finalIsSubscriber ? 1 : 0, // is_subscriber (state)
      subTier,             // sub_tier (optional)
      msgText,
      traits.age,
      traits.word,
      traits.emote,
    ]);

    if (msgs > 0) {
      const bucketStart = alignDown(Date.now(), MINUTE_MS);
      await run(
        `INSERT INTO chattergrounds_pulse (broadcaster_id, bucket_start, messages)
         VALUES (?, ?, ?)
         ON CONFLICT(broadcaster_id, bucket_start)
         DO UPDATE SET messages = messages + excluded.messages`,
        [broadcasterId, bucketStart, msgs]
      );
    }

    return await get(
      "SELECT * FROM chattergrounds_stats WHERE broadcaster_id = ? AND chatter_id = ?",
      [broadcasterId, payload.chatterId]
    );
  } catch (err: any) {
    console.error("Chattergrounds Action Error:", err);
    return { error: err.message || "Failed to update database" };
  }
}


export async function getData(userId?: string) {
  const broadcasterId = userId || "system";
  try {
    await ensureChattergroundsSchema();
    const chatters = await all("SELECT * FROM chattergrounds_stats WHERE broadcaster_id = ? ORDER BY messages_sent DESC", [broadcasterId]);
    const lastUpdateRow = await get("SELECT MAX(updated_at) AS updated_at FROM chattergrounds_stats WHERE broadcaster_id = ?", [broadcasterId]);
    const updatedAt = normalizeSqlTimestamp(lastUpdateRow?.updated_at) ?? new Date().toISOString();
    const messageSeries = await getMessageSeries(broadcasterId);

    return { updatedAt, chatters: chatters || [], origin: userId ? "twitch" : "offline", messageSeries };
  } catch (err: any) {
    console.error("Chattergrounds GET Data Failure:", err);
    return { updatedAt: new Date().toISOString(), chatters: [], origin: userId ? "twitch" : "offline", messageSeries: { today: [], week: [], month: [], all: [] }, error: err.message || "Query failed" };
  }
}

export async function GET() {
  const session = await getValidSession();
  const owner = session ? { userId: session.userId, login: session.login, displayName: session.displayName } : undefined;
  const data = await getData(session?.userId);

  if (session && data.chatters.length === 0) {
    try {
      const chatters = await fetchChatters(session);
      if (chatters.chatters?.length) {
        const liveChatters = chatters.chatters.map((login) => ({
          chatter_id: login,
          name: login,
          messages_sent: 0,
          times_banned: 0,
          times_timed_out: 0,
          quests_completed: 0,
          months_subbed: 0,
          xp: 0,           // Updated key
          toadcoins: 0,    // Updated key
          last_message: null,
          estimated_age: 0,
          favorite_word: null,
          favorite_emote: null,
        }));

        return NextResponse.json({ data: { ...data, chatters: liveChatters, origin: chatters.live ? "twitch" : data.origin, owner } });
      }
    } catch (error) {
      console.error("Chattergrounds live fallback failed", error);
    }
  }

  return NextResponse.json({ data: { ...data, owner } });
}

export async function POST(request: Request) {
  let payload: PersistAction;
  try {
    payload = (await request.json()) as PersistAction;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const session = await getValidSession();
  const result = await applyChattergroundsAction(payload, { sessionUserId: session?.userId });

  if (result && "error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true, data: result });
}
