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

async function readSql(filename: string) {
  const sqlPath = path.join(process.cwd(), "data", "db", "queries", "chattergrounds", filename);
  return await fs.readFile(sqlPath, "utf8");
}

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

  const traits = await getRandomJokeTrait();

  try {
    const initSql = await readSql("init.sql");
    const upsertSql = await readSql("upsert_stats.sql");

    await run(initSql);
    await run(upsertSql, [
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
  } catch (err: any) {
    console.error("Chattergrounds Action Error:", err);
    return { error: err.message || "Failed to update database" };
  }
}

export async function getData(userId?: string) {
  const broadcasterId = userId || "system";
  try {
    const initSql = await readSql("init.sql");
    await run(initSql); 

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
    console.error("Chattergrounds GET Data Failure:", err);
    return { chatters: [], error: err.message || "Query failed" };
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

  if (result && "error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true, data: result });
}