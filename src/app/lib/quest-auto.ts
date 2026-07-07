// src/app/lib/quest-auto.ts
//
// Auto-completion for chatter quests. Every chat message is checked against
// the assigned chatter's open quests; matchable templates complete on the
// spot with no streamer involvement. Quests without a matcher (typeracer,
// gifting, TTS...) stay manual — the streamer claims them from the tavern UI.
//
// State lives in the same per-streamer JSON the stream-quests route owns
// (data/stream-quests/<userId>.json). We only touch chatterQuests + ledger
// and preserve everything else, so the two writers stay compatible. The
// optional `progress` field added here survives the route's spreads.

import { promises as fs } from "node:fs";
import path from "node:path";

const STREAM_QUESTS_DIR = path.join(process.cwd(), "data", "stream-quests");

type ChatterQuestRecord = {
  id: string;
  title: string;
  prompt: string;
  reward: number;
  completed: boolean;
  assignedTo: string;
  assignedToId?: string;
  progress?: number;
  [key: string]: unknown;
};

type QuestStateRecord = {
  date: string;
  chatterQuests?: ChatterQuestRecord[];
  ledger?: Record<string, number>;
  [key: string]: unknown;
};

export type QuestCompletion = {
  questId: string;
  title: string;
  reward: number;
  announce: string;
};

type MatchContext = {
  message: string;
  emotes: string[];
};

// A matcher returns "done", "progress" (step counted, not finished yet),
// or "no". Progress-based quests store their counter on the quest record.
type MatchResult = "done" | "progress" | "no";
type Matcher = { steps?: number; match: (ctx: MatchContext, quest: ChatterQuestRecord) => MatchResult };

function hasEmote(ctx: MatchContext) {
  return ctx.emotes.length > 0;
}

function isEmoteOnly(ctx: MatchContext) {
  if (!ctx.emotes.length) return false;
  let rest = ctx.message;
  for (const e of ctx.emotes) rest = rest.split(e).join(" ");
  return rest.trim().length === 0;
}

function isAllCaps(message: string) {
  const letters = message.replace(/[^a-zA-Z]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s]+$/u;

// Keyed by template id — quest ids are `${templateId}-${uuid}`.
const MATCHERS: Record<string, Matcher> = {
  // one emote-only message per required "minute"; 3 steps is a fair gag
  "cq-emotes-only": {
    steps: 3,
    match: (ctx) => (isEmoteOnly(ctx) ? "progress" : "no"),
  },
  "cq-fav-emote": { match: (ctx) => (hasEmote(ctx) ? "done" : "no") },
  "cq-hype-emote": { match: (ctx) => (hasEmote(ctx) ? "done" : "no") },
  "cq-caps-lock": {
    steps: 5,
    match: (ctx) => (isAllCaps(ctx.message) ? "progress" : "no"),
  },
  "cq-abc-backwards": {
    match: (ctx) =>
      ctx.message.toLowerCase().replace(/[^a-z]/g, "").includes("zyxwvutsrqponmlkjihgfedcba")
        ? "done"
        : "no",
  },
  "cq-glazing": { match: (ctx) => (ctx.message.trim().length >= 150 ? "done" : "no") },
  "cq-copypasta": { match: (ctx) => (ctx.message.trim().length >= 180 ? "done" : "no") },
  "cq-love-list": { match: (ctx) => (ctx.message.trim().length >= 120 ? "done" : "no") },
  "cq-vibe-check": {
    match: (ctx) => (ctx.message.trim().split(/\s+/).length === 3 ? "done" : "no"),
  },
  "cq-question": {
    match: (ctx) => (ctx.message.trim().endsWith("?") && ctx.message.trim().length > 10 ? "done" : "no"),
  },
  "cq-song": {
    match: (ctx) =>
      /spotify\.com|youtu\.?be|soundcloud\.com|music\.apple\.com/i.test(ctx.message) ? "done" : "no",
  },
  "cq-fav-clip": {
    match: (ctx) => (/clips\.twitch\.tv|twitch\.tv\/\S+\/clip/i.test(ctx.message) ? "done" : "no"),
  },
  "cq-emoji-desc": {
    match: (ctx) =>
      ctx.message.trim().length > 0 && EMOJI_ONLY_RE.test(ctx.message.trim()) ? "done" : "no",
  },
  "cq-haiku": {
    // three segments split by / or newline, chat-friendly haiku format
    match: (ctx) => (ctx.message.split(/[\/\n]/).filter((s) => s.trim()).length === 3 ? "done" : "no"),
  },
  "cq-rap": {
    match: (ctx) => (ctx.message.split(/[\/\n]/).filter((s) => s.trim()).length === 2 ? "done" : "no"),
  },
};

function templateIdOf(questId: string): string | null {
  for (const key of Object.keys(MATCHERS)) {
    if (questId.startsWith(`${key}-`)) return key;
  }
  return null;
}

function statePath(userId: string) {
  const safe = String(userId ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(STREAM_QUESTS_DIR, `${safe}.json`);
}

/**
 * Check a chat message against the chatter's open auto-matchable quests.
 * Mutates the quest state file (completed flags, progress, ledger) and
 * returns completions; the caller pays out the rewards.
 */
export async function autoCompleteChatQuests(
  broadcasterId: string,
  chatterId: string,
  chatterName: string,
  message: string,
  emotes: string[],
): Promise<QuestCompletion[]> {
  let state: QuestStateRecord;
  try {
    state = JSON.parse(await fs.readFile(statePath(broadcasterId), "utf8"));
  } catch {
    return []; // no quest state yet — nothing to complete
  }

  // only today's quest board auto-completes
  if (state.date !== new Date().toISOString().slice(0, 10)) return [];
  const quests = Array.isArray(state.chatterQuests) ? state.chatterQuests : [];
  if (!quests.length) return [];

  const nameLower = chatterName.trim().toLowerCase();
  const ctx: MatchContext = { message, emotes };
  const completions: QuestCompletion[] = [];
  let dirty = false;

  for (const quest of quests) {
    if (quest.completed) continue;

    const mine =
      (quest.assignedToId && quest.assignedToId === chatterId) ||
      (!quest.assignedToId && quest.assignedTo?.trim().toLowerCase() === nameLower);
    if (!mine) continue;

    const templateId = templateIdOf(quest.id);
    if (!templateId) continue;
    const matcher = MATCHERS[templateId];

    const result = matcher.match(ctx, quest);
    if (result === "no") continue;

    if (result === "progress" && matcher.steps) {
      const progress = (Number(quest.progress) || 0) + 1;
      quest.progress = progress;
      dirty = true;
      if (progress < matcher.steps) continue;
    }

    quest.completed = true;
    dirty = true;
    completions.push({
      questId: quest.id,
      title: quest.title,
      reward: quest.reward,
      announce: `🏆 ${chatterName} completed "${quest.title}" (+${quest.reward} toadcoins)`,
    });

    const ledger = (state.ledger = state.ledger ?? {});
    const ledgerKey = quest.assignedTo || chatterName;
    ledger[ledgerKey] = (ledger[ledgerKey] ?? 0) + quest.reward;
  }

  if (dirty) {
    await fs.writeFile(statePath(broadcasterId), JSON.stringify(state, null, 2), "utf8");
  }

  return completions;
}
