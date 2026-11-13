// src/app/lib/stream-quest-store.ts
//
// Per-streamer quest board state, stored in SQLite (the same persistent DB
// as everything else) instead of JSON files under data/stream-quests/.
// Those files lived inside the app folder, which every Render deploy
// replaces, so quest progress and ledgers reset on each deploy.
//
// The state is still one JSON document per streamer: the stream-quests
// route and the chat auto-completer (quest-auto.ts) both read-modify-write
// it, and this keeps their existing shapes untouched.
//
// Migration: if a streamer has no row yet but an old JSON file exists
// (local dev, or a file written since the last deploy), it is imported on
// first read.

import { promises as fs } from "node:fs";
import path from "node:path";
import { get, run } from "@/lib/sql";

const LEGACY_DIR = path.join(process.cwd(), "data", "stream-quests");

let tableReady: Promise<unknown> | null = null;
function ensureTable() {
  tableReady ??= run(
    `CREATE TABLE IF NOT EXISTS stream_quest_state (
       user_id TEXT PRIMARY KEY,
       state TEXT NOT NULL,
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  ).catch((e) => {
    tableReady = null;
    throw e;
  });
  return tableReady;
}

/** Same key the old file names used, so imported files line up. */
export function questStateKey(userId: string): string {
  const safe = String(userId ?? "").trim();
  if (!safe) throw new Error("Missing Twitch user id");
  return safe.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** The streamer's saved state, or null if they have none yet. */
export async function readQuestState<T = unknown>(userId: string): Promise<T | null> {
  await ensureTable();
  const key = questStateKey(userId);
  const row = await get<{ state: string }>(`SELECT state FROM stream_quest_state WHERE user_id = ?`, [key]);
  if (row) {
    try {
      return JSON.parse(row.state) as T;
    } catch {
      return null;
    }
  }

  // one-time import of a pre-migration JSON file
  try {
    const raw = await fs.readFile(path.join(LEGACY_DIR, `${key}.json`), "utf8");
    const parsed = JSON.parse(raw) as T;
    await writeQuestState(userId, parsed);
    console.log(`[stream-quests] imported legacy state file for ${key}`);
    return parsed;
  } catch {
    return null;
  }
}

export async function writeQuestState(userId: string, state: unknown): Promise<void> {
  await ensureTable();
  await run(
    `INSERT INTO stream_quest_state (user_id, state, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
    [questStateKey(userId), JSON.stringify(state)],
  );
}
