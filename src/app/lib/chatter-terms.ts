// src/app/lib/chatter-terms.ts
//
// Real favourite-word / favourite-emote tracking per chatter. Every chat
// message bumps counters in chattergrounds_terms; favourites are the highest
// counters. Scales fine in SQLite: one small upsert per distinct term per
// message, and terms per chatter are pruned to a cap.

import { run, get, all } from "@/app/lib/sql";

const MAX_WORDS_PER_MESSAGE = 8;
const MAX_TERMS_PER_CHATTER = 60;
const MIN_WORD_LENGTH = 3;

// boring words that shouldn't win "favourite word"
const STOP = new Set([
  "the", "and", "for", "that", "this", "with", "you", "your", "was", "are",
  "but", "not", "have", "has", "had", "his", "her", "they", "them", "its",
  "just", "like", "what", "when", "where", "who", "how", "why", "can", "cant",
  "dont", "does", "did", "will", "would", "should", "could", "there", "here",
  "about", "into", "out", "all", "any", "some", "one", "two", "get", "got",
  "him", "she", "were", "been", "being", "than", "then", "too", "very",
]);

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await run(`
        CREATE TABLE IF NOT EXISTS chattergrounds_terms (
          broadcaster_id TEXT NOT NULL,
          chatter_id TEXT NOT NULL,
          term TEXT NOT NULL,
          kind TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (broadcaster_id, chatter_id, term, kind)
        )
      `);
    })();
  }
  return schemaReady;
}

export function extractWords(message: string): string[] {
  const words = message
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9']+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= MIN_WORD_LENGTH && w.length <= 24 && !STOP.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, MAX_WORDS_PER_MESSAGE);
}

/**
 * Record terms for a message and return the chatter's current favourites.
 * `emotes` should come from the EventSub message fragments.
 */
export async function recordTerms(
  broadcasterId: string,
  chatterId: string,
  message: string,
  emotes: string[],
): Promise<{ favoriteWord: string | null; favoriteEmote: string | null }> {
  await ensureSchema();

  const words = extractWords(message);
  const uniqueEmotes = [...new Set(emotes.filter((e) => typeof e === "string" && e.length > 0))].slice(0, 8);

  for (const term of words) {
    await run(
      `INSERT INTO chattergrounds_terms (broadcaster_id, chatter_id, term, kind, count)
       VALUES (?, ?, ?, 'word', 1)
       ON CONFLICT(broadcaster_id, chatter_id, term, kind)
       DO UPDATE SET count = count + 1`,
      [broadcasterId, chatterId, term],
    );
  }
  for (const term of uniqueEmotes) {
    await run(
      `INSERT INTO chattergrounds_terms (broadcaster_id, chatter_id, term, kind, count)
       VALUES (?, ?, ?, 'emote', 1)
       ON CONFLICT(broadcaster_id, chatter_id, term, kind)
       DO UPDATE SET count = count + 1`,
      [broadcasterId, chatterId, term],
    );
  }

  // occasional prune so a chatty user's term list stays bounded
  if (Math.abs(hashCode(`${chatterId}:${message.length}`)) % 50 === 0) {
    await run(
      `DELETE FROM chattergrounds_terms
       WHERE broadcaster_id = ? AND chatter_id = ? AND rowid NOT IN (
         SELECT rowid FROM chattergrounds_terms
         WHERE broadcaster_id = ? AND chatter_id = ?
         ORDER BY count DESC LIMIT ${MAX_TERMS_PER_CHATTER}
       )`,
      [broadcasterId, chatterId, broadcasterId, chatterId],
    );
  }

  const favWord = (await get(
    `SELECT term FROM chattergrounds_terms
     WHERE broadcaster_id = ? AND chatter_id = ? AND kind = 'word'
     ORDER BY count DESC, term ASC LIMIT 1`,
    [broadcasterId, chatterId],
  )) as { term: string } | undefined;
  const favEmote = (await get(
    `SELECT term FROM chattergrounds_terms
     WHERE broadcaster_id = ? AND chatter_id = ? AND kind = 'emote'
     ORDER BY count DESC, term ASC LIMIT 1`,
    [broadcasterId, chatterId],
  )) as { term: string } | undefined;

  return { favoriteWord: favWord?.term ?? null, favoriteEmote: favEmote?.term ?? null };
}

export function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/** Deterministic joke age per chatter — a gag stat, but a STABLE gag. */
export function stableGagAge(chatterId: string): number {
  return 12 + (Math.abs(hashCode(chatterId)) % 69); // 12..80
}
