import { NextResponse } from "next/server";
import { fetchChatters, getValidSession } from "@/app/lib/twitch-auth";
import { run, get, all } from "@/app/lib/sql";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

/**
 * IMPORTANT:
 * Your ingest now (should) pass chatterLogin + chatterDisplayName from EventSub.
 * We store a human-friendly "name" (login preferred) instead of the numeric chatterId.
 */
type ChatterIdentity = {
  chatterId: string;
  chatterLogin?: string; // e.g. "spicylemones"
  chatterDisplayName?: string; // e.g. "SpicyLemones"
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
  const sqlPath = path.join(
    process.cwd(),
    "data",
    "db",
    "queries",
    "chattergrounds",
    filename
  );
  return await fs.readFile(sqlPath, "utf8");
}

let schemaReadyPromise: Promise<void> | null = null;
async function ensureChattergroundsSchema() {
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    const initSql = await readSql("init.sql");
    await run(initSql);

    const alterStatements = [
      "ALTER TABLE chattergrounds_stats ADD COLUMN estimated_age INTEGER DEFAULT 0",
      "ALTER TABLE chattergrounds_stats ADD COLUMN favorite_word TEXT",
      "ALTER TABLE chattergrounds_stats ADD COLUMN favorite_emote TEXT",
      // If you *already* have these columns, duplicate errors will be ignored.
      // If you want display name stored separately, add this + update your SQL:
      // "ALTER TABLE chattergrounds_stats ADD COLUMN display_name TEXT",
      // "ALTER TABLE chattergrounds_stats ADD COLUMN login TEXT",
    ];

    for (const sql of alterStatements) {
      try {
        await run(sql);
      } catch (err: any) {
        if (!String(err?.message ?? "").includes("duplicate column name")) {
          throw err;
        }
      }
    }
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
  // Prefer login (stable + lowercase), then display name (pretty), then id (fallback)
  return payload.chatterLogin || payload.chatterDisplayName || payload.chatterId;
}

export async function applyChattergroundsAction(
  payload: PersistAction,
  context: ApplyContext = {}
) {
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

  // NOTE: This currently generates new "traits" every update.
  // If you want traits to be "set once", change upsert_stats.sql to only set them on INSERT,
  // or do a SELECT first and only generate when the row doesn't exist.
  const traits = await getRandomJokeTrait();

  try {
    await ensureChattergroundsSchema();
    const upsertSql = await readSql("upsert_stats.sql");

    // Your current param order is:
    // broadcaster_id, chatter_id, name, msgs, bans, timeouts, subs, quests, mint, last_message, estimated_age, favorite_word, favorite_emote
    await run(upsertSql, [
      broadcasterId,
      payload.chatterId,
      storedName, // ✅ FIX: store human name/login instead of numeric id
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

    return {
      updatedAt: new Date().toISOString(),
      chatters: chatters || [],
      origin: userId ? "twitch" : "offline",
    };
  } catch (err: any) {
    console.error("Chattergrounds GET Data Failure:", err);
    return { chatters: [], error: err.message || "Query failed" };
  }
}

export async function GET() {
  const session = await getValidSession();
  const owner = session
    ? { userId: session.userId, login: session.login, displayName: session.displayName }
    : undefined;

  const data = await getData(session?.userId);

  // "Live fallback" if DB is empty: returns current chatters (logins) for UI only.
  // This does NOT persist to DB.
  if (session && data.chatters.length === 0) {
    try {
      const chatters = await fetchChatters(session);
      if (chatters.chatters?.length) {
        const liveChatters = chatters.chatters.map((login) => ({
          // NOTE: This is just UI fallback. It uses login as id.
          // Your real DB rows will use numeric chatter_id from EventSub, with name=login.
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
            updatedAt: new Date().toISOString(),
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
