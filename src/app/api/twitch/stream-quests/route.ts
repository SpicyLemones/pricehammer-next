import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { getValidSession } from "@/app/lib/twitch-auth";
// Import the database logic from your chattergrounds route
import { applyChattergroundsAction } from "@/app/api/twitch/chattergrounds/route";

// NEW: read recipients from chattergrounds DB
import { all } from "@/app/lib/sql";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type QuestCategory =
  | "prime"
  | "ban"
  | "timeout"
  | "stream-time"
  | "insult"
  | "wordle"
  | "bandle";

type StreamQuest = {
  id: string;
  title: string;
  prompt: string;
  reward: number;
  category: QuestCategory;
  completed: boolean;
  completedAt?: string;
};

type AudienceSnapshot = {
  names: string[];
  source: "twitch" | "offline" | "unauthenticated" | "fallback" | "error";
  displayName?: string;
  live?: boolean;
  note?: string;
};

type StreamQuestState = {
  date: string;
  generatedAt: string;
  quests: StreamQuest[];
  ledger: Record<string, number>;
  lastAudienceHour: number;
  lastAudience: AudienceSnapshot;
};

type QuestVariable =
  | { key: string; type: "range"; min: number; max: number }
  | { key: string; type: "chatter" };

type QuestTemplateConfig = {
  id: string;
  category: QuestCategory;
  title: string;
  prompt: string;
  reward?: number;
  variables?: QuestVariable[];
};

const DATA_PATH = path.join(process.cwd(), "data", "stream-quests.json");
const TEMPLATE_LIBRARY_PATH = path.join(process.cwd(), "data", "quest-library.json");

const FALLBACK_CHATTERS = [
  "toadette",
  "chat_goblin",
  "ban_me_please",
  "lilypadlurker",
  "hammerfan",
  "modbot9000",
  "ribbitriot",
];

const BOT_LOGINS = new Set([
  "streamelements",
  "nightbot",
  "moobot",
  "streamlabs",
  "soundalerts",
  "sery_bot",
]);

const DEFAULT_TEMPLATE_LIBRARY: QuestTemplateConfig[] = [
  {
    id: "prime-beggar",
    category: "prime",
    title: "Prime Beggar",
    prompt: "Successfully beg for {{count}} Twitch Prime sub{{plural:count:s}}.",
    reward: 500,
    variables: [{ key: "count", type: "range", min: 1, max: 3 }],
  },
  {
    id: "ban-random",
    category: "ban",
    title: "See You Later",
    prompt: "Ban {{chatter}} from your chat (they'll forgive you… probably).",
    reward: 500,
    variables: [{ key: "chatter", type: "chatter" }],
  },
  {
    id: "timeout-random",
    category: "timeout",
    title: "Naughty Step",
    prompt: "Time out {{chatter}} for {{minutes}} minute{{plural:minutes:s}}.",
    reward: 500,
    variables: [
      { key: "chatter", type: "chatter" },
      { key: "minutes", type: "range", min: 1, max: 20 },
    ],
  },
  {
    id: "stream-hours",
    category: "stream-time",
    title: "Stay Live",
    prompt: "Stream for more than {{hours}} hour{{plural:hours:s}}.",
    reward: 500,
    variables: [{ key: "hours", type: "range", min: 1, max: 5 }],
  },
  {
    id: "insult-random",
    category: "insult",
    title: "Roast Duty",
    prompt: "Drop a playful insult on {{chatter}} in chat.",
    reward: 500,
    variables: [{ key: "chatter", type: "chatter" }],
  },
  {
    id: "wordle",
    category: "wordle",
    title: "Wordle Warrior",
    prompt: "Complete today’s Wordle on stream.",
    reward: 500,
  },
  {
    id: "bandle",
    category: "bandle",
    title: "Bandle Bard",
    prompt: "Complete today’s Bandle on stream.",
    reward: 500,
  },
];

type DbRecipient = { chatterId: string; login: string };

type TwitchSession = Awaited<ReturnType<typeof getValidSession>>;

function jsonNoStore(body: any, init?: { status?: number; headers?: HeadersInit }) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    Vary: "Cookie",
    ...(init?.headers as any),
  };

  return NextResponse.json(body, { status: init?.status, headers });
}

async function loadRecipientsFromChattergrounds(broadcasterId: string): Promise<DbRecipient[]> {
  const rows = (await all(
    `SELECT chatter_id, name
     FROM chattergrounds_stats
     WHERE broadcaster_id = ?
       AND chatter_id GLOB '[0-9]*'
     ORDER BY updated_at DESC`,
    [broadcasterId]
  )) as any[];

  const seen = new Set<string>();
  const out: DbRecipient[] = [];

  for (const r of rows ?? []) {
    const chatterId = String(r?.chatter_id ?? "").trim();
    const login = String(r?.name ?? "").trim().toLowerCase();
    if (!chatterId || !login) continue;
    if (BOT_LOGINS.has(login)) continue;
    if (seen.has(chatterId)) continue;
    seen.add(chatterId);
    out.push({ chatterId, login });
  }

  return out;
}

/**
 * Best-effort "are we live?" check.
 * - If we can’t verify (missing client id, API fails), we return `null` (unknown).
 * - Call sites should treat unknown as “don’t hard-block”.
 */
async function checkLiveStatus(session: TwitchSession): Promise<boolean | null> {
  try {
    if (!session?.accessToken || !session?.userId) return null;
    const clientId = process.env.TWITCH_CLIENT_ID || process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
    if (!clientId) return null;

    const url = `https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(session.userId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${session.accessToken}`,
      },
      cache: "no-store",
    });

    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as any;
    const live = Array.isArray(json?.data) && json.data.length > 0;
    return live;
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await getValidSession();

  // 1. Block if not logged in
  if (!session) {
    return jsonNoStore({ error: "unauthenticated" }, { status: 401 });
  }

  const audience = await loadAudience(session);

  // 2. Block if stream is not live (The Tavern is Closed)
  // NOTE: Only hard-block if we can confidently say it's offline.
  if (audience.live === false) {
    return jsonNoStore(
      {
        error: "offline",
        message: "The Tavern is closed. You must be live to access quests.",
      },
      { status: 200 }
    );
  }

  const { state, regenerated } = await ensureState(audience);

  return jsonNoStore({
    regenerated,
    ...serializeState(state),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { id?: string; action?: string }
    | null;

  // 1. Auth Check
  const session = await getValidSession();
  if (!session) return jsonNoStore({ error: "unauthorized" }, { status: 401 });

  const broadcasterId = session.userId;
  const broadcasterLogin = (session.login || session.displayName).toLowerCase();

  // 2. Load Audience & Status (single session used everywhere; avoids “works after visiting other page” flakiness)
  const audience = await loadAudience(session);

  // 3. TAVERN CHECK: Prevent actions if offline (only if confidently offline)
  if (audience.live === false) {
    return jsonNoStore({ error: "offline", message: "The Tavern is closed." }, { status: 403 });
  }

  const { state } = await ensureState(audience);

  const action = body?.action ?? (body?.id ? "claim" : undefined);

  // --- ACTION: REROLL ---
  if (action === "reroll") {
    const questTemplates = await loadQuestTemplates();

    // IMPORTANT FIX:
    // Keep the current order and ONLY replace the incomplete slots in-place.
    // (Your old function returned [...completed, ...replacements] which reorders = “board reshuffles”.)
    const newQuests = rerollIncompleteQuestsPreserveOrder(state.quests, audience, questTemplates);

    const rerolledState: StreamQuestState = {
      ...state,
      quests: newQuests,
      generatedAt: new Date().toISOString(),
      lastAudience: audience,
      lastAudienceHour: seedFromCurrentHour(),
    };

    await saveState(rerolledState);
    return jsonNoStore({
      regenerated: true,
      ...serializeState(rerolledState),
    });
  }

  // --- ACTION: COMPLETE QUEST ---
  if (action !== "claim") {
    return jsonNoStore({ error: "bad_request" }, { status: 400 });
  }

  if (!body?.id) return jsonNoStore({ error: "missing_id" }, { status: 400 });

  const quest = state.quests.find((entry) => entry.id === body.id);
  if (!quest) return jsonNoStore({ error: "quest_not_found" }, { status: 404 });
  if (quest.completed) return jsonNoStore({ alreadyCompleted: true, ...serializeState(state) });

  // 1. Get RECENT chatters from chattergrounds DB
  const recipients = await loadRecipientsFromChattergrounds(broadcasterId);

  // 2. Separate Broadcaster for Quest Completion tracking
  await applyChattergroundsAction(
    {
      action: "quest-completed",
      chatterId: broadcasterId,
      chatterLogin: broadcasterLogin,
      amount: quest.reward,
    },
    { sessionUserId: broadcasterId }
  );

  // 3. Mint coins for everyone else who is active
  const others = recipients.filter((r) => r.chatterId !== broadcasterId);
  const BATCH_SIZE = 10;
  for (let i = 0; i < others.length; i += BATCH_SIZE) {
    const batch = others.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((r) =>
        applyChattergroundsAction(
          {
            action: "mint",
            chatterId: r.chatterId,
            chatterLogin: r.login,
            amount: quest.reward,
          },
          { sessionUserId: broadcasterId }
        )
      )
    );
  }

  // 4. Update the local JSON ledger
  const ledger = { ...state.ledger };
  ledger[broadcasterLogin] = (ledger[broadcasterLogin] ?? 0) + quest.reward;
  for (const r of others) {
    ledger[r.login] = (ledger[r.login] ?? 0) + quest.reward;
  }

  const updatedQuest: StreamQuest = {
    ...quest,
    completed: true,
    completedAt: new Date().toISOString(),
  };

  const updatedState: StreamQuestState = {
    ...state,
    quests: state.quests.map((entry) => (entry.id === quest.id ? updatedQuest : entry)),
    ledger,
    lastAudience: audience,
    lastAudienceHour: seedFromCurrentHour(),
  };

  await saveState(updatedState);

  return jsonNoStore({
    quest: updatedQuest,
    recipients: [broadcasterLogin, ...others.map((r) => r.login)],
    totalRewarded: quest.reward * (others.length + 1),
    ...serializeState(updatedState),
  });
}

async function ensureState(audience: AudienceSnapshot) {
  const today = currentDateKey();
  const existing = await loadState();
  const questTemplates = await loadQuestTemplates();
  const currentHour = seedFromCurrentHour();

  if (existing && existing.date === today) {
    // IMPORTANT FIX:
    // Do NOT regenerate quests just because roster/audience changed.
    // That was causing “first claim reshuffles” (completed quests moved to front + new replacements).
    //
    // Only top-up if we somehow have fewer than 6 quests.
    const needsTopUp = !Array.isArray(existing.quests) || existing.quests.length < 6;

    if (needsTopUp) {
      const toppedUp = topUpQuestsPreserveOrder(existing.quests ?? [], audience, questTemplates);
      const regeneratedState: StreamQuestState = {
        ...existing,
        quests: toppedUp,
        generatedAt: new Date().toISOString(),
        lastAudience: audience,
        lastAudienceHour: currentHour,
      };
      await saveState(regeneratedState);
      return { state: regeneratedState, regenerated: true };
    }

    const updated: StreamQuestState = {
      ...existing,
      lastAudience: audience,
      lastAudienceHour: currentHour,
    };
    await saveState(updated);
    return { state: updated, regenerated: false };
  }

  const quests = buildQuests(audience, questTemplates);
  const state: StreamQuestState = {
    date: today,
    generatedAt: new Date().toISOString(),
    quests,
    ledger: existing?.ledger ?? {},
    lastAudienceHour: currentHour,
    lastAudience: audience,
  };

  await saveState(state);
  return { state, regenerated: true };
}

async function loadState(): Promise<StreamQuestState | null> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as StreamQuestState;
    if (!parsed.date || !Array.isArray(parsed.quests) || parsed.ledger === undefined) {
      return null;
    }
    return {
      ...parsed,
      lastAudienceHour: parsed.lastAudienceHour ?? seedFromCurrentHour(),
      lastAudience: parsed.lastAudience ?? { names: FALLBACK_CHATTERS, source: "fallback", live: true },
    };
  } catch {
    return null;
  }
}

async function saveState(state: StreamQuestState) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(state, null, 2), "utf8");
}

function serializeState(state: StreamQuestState) {
  return {
    date: state.date,
    generatedAt: state.generatedAt,
    quests: state.quests,
    ledger: state.ledger,
    audience: state.lastAudience,
  };
}

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickChatter(chatters: string[], fallback: string[] = FALLBACK_CHATTERS) {
  const pool = chatters.length ? chatters : fallback;
  if (!pool.length) return "a viewer";
  return pool[Math.floor(Math.random() * pool.length)];
}

function seedFromCurrentHour() {
  return Math.floor(Date.now() / 3_600_000);
}

function shuffleWithSeed(values: string[], seed: number) {
  const result = [...values];
  let rng = seed % 2147483647;
  if (rng <= 0) rng += 2147483646;

  for (let i = result.length - 1; i > 0; i -= 1) {
    rng = (rng * 16807) % 2147483647;
    const j = rng % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

async function loadQuestTemplates(): Promise<QuestTemplateConfig[]> {
  try {
    const raw = await fs.readFile(TEMPLATE_LIBRARY_PATH, "utf8");
    const parsed = JSON.parse(raw) as QuestTemplateConfig[] | { templates?: QuestTemplateConfig[] };
    const templates = Array.isArray(parsed) ? parsed : parsed.templates;
    const sanitized = (templates ?? []).map(sanitizeTemplateConfig).filter(Boolean) as QuestTemplateConfig[];
    if (sanitized.length >= 6) return sanitized;
  } catch (error) {
    console.warn("Stream quest: failed to load quest-library.json, using defaults.", error);
  }
  return DEFAULT_TEMPLATE_LIBRARY;
}

function buildQuests(audience: AudienceSnapshot, library: QuestTemplateConfig[]): StreamQuest[] {
  if (library.length < 6) {
    throw new Error("At least 6 quest templates are required to build a daily set.");
  }
  const shuffled = [...library].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 6);

  return selected.map((template) => {
    const variables = resolveVariables(template.variables ?? [], audience);
    const prompt = renderPrompt(template.prompt, variables);
    const reward = template.reward ?? 500;

    return {
      id: `${template.id}-${crypto.randomUUID()}`,
      title: template.title,
      prompt,
      reward,
      category: template.category,
      completed: false,
      completedAt: undefined,
    };
  });
}

/**
 * IMPORTANT FIX:
 * Reroll incomplete quests IN PLACE, preserving the existing order.
 * (No “completed quests move to the front” reshuffle.)
 */
function rerollIncompleteQuestsPreserveOrder(
  existingQuests: StreamQuest[],
  audience: AudienceSnapshot,
  library: QuestTemplateConfig[]
) {
  const base = Array.isArray(existingQuests) ? existingQuests.slice(0, 6) : [];
  const replacements = buildQuests(audience, library);

  let repIndex = 0;

  const out: StreamQuest[] = base.map((q) => {
    if (q.completed) return q;
    const next = replacements[repIndex++]!;
    return next;
  });

  // Top-up to 6 if we somehow had fewer
  while (out.length < 6 && repIndex < replacements.length) {
    out.push(replacements[repIndex++]!);
  }

  return out;
}

/**
 * Top-up only (no reroll): if we have < 6 quests, append new ones until we hit 6.
 * Keeps existing order stable.
 */
function topUpQuestsPreserveOrder(
  existingQuests: StreamQuest[],
  audience: AudienceSnapshot,
  library: QuestTemplateConfig[]
) {
  const base = Array.isArray(existingQuests) ? existingQuests.slice(0, 6) : [];
  if (base.length >= 6) return base;

  const needed = 6 - base.length;
  const additions = buildQuests(audience, library).slice(0, needed);
  return [...base, ...additions];
}

function renderPrompt(prompt: string, values: Record<string, string | number>) {
  const withPlural = prompt.replace(/\{\{plural:([^:}]+):([^}]+)\}\}/g, (match, key, suffix) => {
    const value = values[key];
    if (typeof value === "number" && value === 1) return "";
    return typeof value !== "undefined" ? suffix : match;
  });

  return withPlural.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const value = values[key];
    return typeof value !== "undefined" ? String(value) : match;
  });
}

function resolveVariables(variables: QuestVariable[], audience: AudienceSnapshot) {
  const values: Record<string, string | number> = {};

  variables.forEach((variable) => {
    if (variable.type === "range") {
      const min = Number.isFinite(variable.min) ? variable.min : 1;
      const max = Number.isFinite(variable.max) ? variable.max : min;
      values[variable.key] = randomBetween(min, max);
    }
    if (variable.type === "chatter") {
      const fallbackNames =
        audience.source === "twitch"
          ? ([audience.displayName].filter(Boolean) as string[])
          : FALLBACK_CHATTERS;
      values[variable.key] = pickChatter(audience.names, fallbackNames);
    }
  });

  return values;
}

function sanitizeTemplateConfig(config: QuestTemplateConfig) {
  if (!config?.id || !config.title || !config.prompt) return null;
  if (!["prime", "ban", "timeout", "stream-time", "insult", "wordle", "bandle"].includes(config.category)) {
    return null;
  }
  return {
    ...config,
    variables: (config.variables ?? []).filter((variable) => {
      if (variable.type === "chatter") return !!variable.key;
      if (variable.type === "range") {
        return !!variable.key && Number.isFinite(variable.min) && Number.isFinite(variable.max);
      }
      return false;
    }),
  };
}

async function loadAudience(session: TwitchSession): Promise<AudienceSnapshot> {
  try {
    if (!session) {
      return {
        names: FALLBACK_CHATTERS,
        source: "unauthenticated",
        live: undefined,
        note: "Link Twitch to use chattergrounds roster. Using placeholders for now.",
      };
    }

    const recips = await loadRecipientsFromChattergrounds(session.userId);

    // We keep this deterministic-per-hour, but we no longer let roster changes trigger quest regeneration.
    const names = shuffleWithSeed(
      recips.map((r) => r.login),
      seedFromCurrentHour()
    );

    const liveCheck = await checkLiveStatus(session);
    const live = liveCheck ?? true; // if unknown, don't false-negative lock the board

    return {
      names,
      source: "twitch",
      displayName: session.displayName,
      live,
      note: names.length === 0 ? "No chattergrounds users recorded yet." : undefined,
    };
  } catch (error) {
    console.error("Stream quest: failed to load chattergrounds roster", error);
    return {
      names: FALLBACK_CHATTERS,
      source: "error",
      live: undefined,
      note: "DB error while loading roster.",
    };
  }
}
