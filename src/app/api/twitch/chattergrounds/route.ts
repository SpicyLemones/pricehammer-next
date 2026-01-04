import { NextResponse } from "next/server";
import { fetchChatters, getValidSession } from "@/app/lib/twitch-auth";
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

export type PersistAction =
  | (ChatterIdentity & { action: "mint"; amount: number })
  | (ChatterIdentity & { action: "record-message"; message?: string })
  | (ChatterIdentity & { action: "ban" })
  | (ChatterIdentity & { action: "timeout" })
  | (ChatterIdentity & { action: "quest-completed"; amount?: number })
  | (ChatterIdentity & { action: "sub-months"; months: number });

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

    // existing DBs: add missing columns safely
    const alterStatements = [
      "ALTER TABLE chattergrounds_stats ADD COLUMN estimated_age INTEGER DEFAULT 0",
      "ALTER TABLE chattergrounds_stats ADD COLUMN favorite_word TEXT",
      "ALTER TABLE chattergrounds_stats ADD COLUMN favorite_emote TEXT",
    ];

    for (const sql of alterStatements) {
      try {
        await run(sql);
      } catch (err: any) {
        if (!String(err?.message ?? "").includes("duplicate column name")) throw err;
      }
    }

    // ensure pulse table exists even if init.sql didn’t run multi-statement
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

  // Always at least 2 points so your chart never shows “Awaiting…”
  if (points.length === 1) {
    points.unshift({ timestamp: new Date(start - stepMs).toISOString(), messages: 0 });
  }
  if (points.length === 0) {
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

  const todayStart = now - 60 * MINUTE_MS; // last 60 minutes
  const weekStart = now - 7 * 24 * HOUR_MS; // last 7 days
  const monthStart = now - 30 * DAY_MS; // last 30 days

  const minRow = await get(
    "SELECT MIN(bucket_start) AS min_bucket FROM chattergrounds_pulse WHERE broadcaster_id = ?",
    [broadcasterId]
  );

  const minBucket = Number(minRow?.min_bucket ?? 0);
  const capAllStart = now - 730 * DAY_MS; // cap “all” to last ~2 years to keep payload sane
  const allStart = minBucket > 0 ? Math.max(minBucket, capAllStart) : capAllStart;

  // today (per-minute)
  const todayRows = await all(
    `SELECT bucket_start, messages
     FROM chattergrounds_pulse
     WHERE broadcaster_id = ? AND bucket_start >= ?
     ORDER BY bucket_start ASC`,
    [broadcasterId, alignDown(todayStart, MINUTE_MS)]
  );

  // week (per-hour)
  const weekRows = await all(
    `SELECT (CAST(bucket_start / ${HOUR_MS} AS INTEGER) * ${HOUR_MS}) AS bucket_start,
            SUM(messages) AS messages
     FROM chattergrounds_pulse
     WHERE broadcaster_id = ? AND bucket_start >= ?
     GROUP BY 1
     ORDER BY 1 ASC`,
    [broadcasterId, alignDown(weekStart, HOUR_MS)]
  );

  // month (per-day)
  const monthRows = await all(
    `SELECT (CAST(bucket_start / ${DAY_MS} AS INTEGER) * ${DAY_MS}) AS bucket_start,
            SUM(messages) AS messages
     FROM chattergrounds_pulse
     WHERE broadcaster_id = ? AND bucket_start >= ?
     GROUP BY 1
     ORDER BY 1 ASC`,
    [broadcasterId, alignDown(monthStart, DAY_MS)]
  );

  // all (per-day)
  const allRows = await all(
    `SELECT (CAST(bucket_start / ${DAY_MS} AS INTEGER) * ${DAY_MS}) AS bucket_start,
            SUM(messages) AS messages
     FROM chattergrounds_pulse
     WHERE broadcaster_id = ? AND bucket_start >= ?
     GROUP BY 1
     ORDER BY 1 ASC`,
    [broadcasterId, alignDown(allStart, DAY_MS)]
  );

  return {
    today: fillBuckets(todayStart, now, MINUTE_MS, todayRows),
    week: fillBuckets(weekStart, now, HOUR_MS, weekRows),
    month: fillBuckets(monthStart, now, DAY_MS, monthRows),
    all: fillBuckets(allStart, now, DAY_MS, allRows),
  };
}

function normalizeSqlTimestamp(ts: unknown) {
  if (typeof ts !== "string" || !ts) return null;
  // SQLite CURRENT_TIMESTAMP => "YYYY-MM-DD HH:MM:SS"
  if (ts.includes(" ") && !ts.includes("T")) {
    return new Date(ts.replace(" ", "T") + "Z").toISOString();
  }
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function applyChattergroundsAction(payload: PersistAction, context: ApplyContext = {}) {
  const broadcasterId = context.sessionUserId || "system";

  let msgs = 0,
    bans = 0,
    timeouts = 0,
    subs = 0,
    quests = 0,
    mint = 0,
    msgText: string | null = null;

  if (payload.action === "record-message") {
    msgs = 1;
    msgText = payload.message?.slice(0, 240) || null;
  } else if (payload.action === "ban") {
    bans = 1;
  } else if (payload.action === "timeout") {
    timeouts = 1;
  } else if (payload.action === "sub-months") {
    subs = payload.months;
  } else if (payload.action === "quest-completed") {
    quests = payload.amount || 1;
  } else if (payload.action === "mint") {
    mint = payload.amount;
  }

  const storedName = resolveStoredName(payload);
  const traits = await getRandomJokeTrait();

  try {
    await ensureChattergroundsSchema();

    // 1) Update chatter stats
    const upsertSql = await readSql("upsert_stats.sql");
    await run(upsertSql, [
      broadcasterId,
      payload.chatterId,
      storedName,
      msgs,
      bans,
      timeouts,
      subs,
      quests,
      mint,
      msgText,
      traits.age,
      traits.word,
      traits.emote,
    ]);

    // 2) Update pulse (only for real messages)
    if (msgs > 0) {
      const bucketStart = alignDown(Date.now(), MINUTE_MS);
      await run(
        `INSERT INTO chattergrounds_pulse (broadcaster_id, bucket_start, messages)
         VALUES (?, ?, ?)
         ON CONFLICT(broadcaster_id, bucket_start) DO UPDATE SET
           messages = messages + excluded.messages`,
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

    const chatters = await all(
      "SELECT * FROM chattergrounds_stats WHERE broadcaster_id = ? ORDER BY messages_sent DESC",
      [broadcasterId]
    );

    const lastUpdateRow = await get(
      "SELECT MAX(updated_at) AS updated_at FROM chattergrounds_stats WHERE broadcaster_id = ?",
      [broadcasterId]
    );

    const updatedAt =
      normalizeSqlTimestamp(lastUpdateRow?.updated_at) ?? new Date().toISOString();

    const messageSeries = await getMessageSeries(broadcasterId);

    return {
      updatedAt,
      chatters: chatters || [],
      origin: userId ? "twitch" : "offline",
      messageSeries,
    };
  } catch (err: any) {
    console.error("Chattergrounds GET Data Failure:", err);
    return {
      updatedAt: new Date().toISOString(),
      chatters: [],
      origin: userId ? "twitch" : "offline",
      messageSeries: { today: [], week: [], month: [], all: [] },
      error: err.message || "Query failed",
    };
  }
}

export async function GET() {
  const session = await getValidSession();
  const owner = session
    ? { userId: session.userId, login: session.login, displayName: session.displayName }
    : undefined;

  const data = await getData(session?.userId);

  // Live fallback if DB empty (UI-only)
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
          toadcoins_minted: 0,
          toadcoins: 0,
          last_message: null,
          estimated_age: 0,
          favorite_word: null,
          favorite_emote: null,
        }));

        return NextResponse.json({
          data: {
            ...data,
            chatters: liveChatters,
            origin: chatters.live ? "twitch" : data.origin,
            owner,
          },
        });
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
  const result = await applyChattergroundsAction(payload, {
    sessionUserId: session?.userId,
  });

  if (result && "error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true, data: result });
}
