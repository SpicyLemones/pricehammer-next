import { NextResponse } from "next/server";
import { fetchChatters, getValidSession } from "@/app/lib/twitch-auth";
import { run, get, all } from "@/app/lib/sql";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export type PersistAction =
  | { action: "mint"; chatterId: string; amount: number }
  | { action: "record-message"; chatterId: string; message?: string }
  | { action: "ban"; chatterId: string }
  | { action: "timeout"; chatterId: string }
  | { action: "quest-completed"; chatterId: string; amount?: number }
  | { action: "sub-months"; chatterId: string; months: number };

type ApplyContext = {
  sessionUserId?: string;
  owner?: { userId?: string; login?: string; displayName?: string };
  origin?: string;
};

/**
 * Helper to get a random item from our config JSON
 */
async function getRandomJokeTrait() {
  try {
    const configPath = path.join(process.cwd(), "data", "chattergrounds_config.json");
    const file = await fs.readFile(configPath, "utf8");
    const { jokeWords, jokeEmotes } = JSON.parse(file);
    
    return {
      word: jokeWords[Math.floor(Math.random() * jokeWords.length)],
      emote: jokeEmotes[Math.floor(Math.random() * jokeEmotes.length)],
      age: Math.floor(Math.random() * (80 - 12 + 1)) + 12
    };
  } catch (e) {
    // Fallback if file is missing
    return { word: "Toad", emote: "Kappa", age: 25 };
  }
}

export async function applyChattergroundsAction(
  payload: PersistAction,
  context: ApplyContext = {}
) {
  const broadcasterId = context.sessionUserId || "system";
  
  let msgs = 0, bans = 0, timeouts = 0, subs = 0, quests = 0, mint = 0, msgText = null;

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

  // Get random traits (only applied if the chatter is NEW)
  const traits = await getRandomJokeTrait();

  try {
    await run("chattergrounds/init");

    await run("chattergrounds/upsert_stats", [
      broadcasterId,
      payload.chatterId,
      payload.chatterId, 
      msgs,
      bans,
      timeouts,
      subs,
      quests,
      mint,
      msgText,
      traits.age,
      traits.word,
      traits.emote
    ]);

    return await get(
      "SELECT * FROM chattergrounds_stats WHERE broadcaster_id = ? AND chatter_id = ?",
      [broadcasterId, payload.chatterId]
    );
  } catch (err) {
    console.error("Chattergrounds DB Error:", err);
    return { error: "Failed to update database" };
  }
}

export async function getData(userId?: string) {
  const broadcasterId = userId || "system";
  
  try {
    // 1. MANUALLY LOAD AND RUN INIT.SQL
    // This bypasses any pathing issues with your 'run' helper
    const sqlPath = path.join(process.cwd(), "app/lib/sql/chattergrounds/init.sql");
    const initSql = await fs.readFile(sqlPath, "utf8");
    await run(initSql); 

    // 2. NOW RUN THE QUERY
    const chatters = await all(
      "SELECT * FROM chattergrounds_stats WHERE broadcaster_id = ? ORDER BY messages_sent DESC",
      [broadcasterId]
    );

    return {
      updatedAt: new Date().toISOString(),
      chatters: chatters || [],
      origin: userId ? "twitch" : "offline"
    };
  } catch (err: any) {
    console.error("Chattergrounds DB Failure:", err);
    return { 
      chatters: [], 
      error: err.message,
      path_attempted: path.join(process.cwd(), "app/lib/sql/chattergrounds/init.sql")
    };
  }
}
export async function GET() {
  const session = await getValidSession();
  const data = await getData(session?.userId);
  return NextResponse.json({ data });
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

  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true, data: result });
}