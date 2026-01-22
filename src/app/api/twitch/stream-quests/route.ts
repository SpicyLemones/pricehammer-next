import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { fetchChatters, getValidSession } from "@/app/lib/twitch-auth";
// Import the database logic from your chattergrounds route
import { applyChattergroundsAction } from "@/app/api/twitch/chattergrounds/route";

// Read recipients from chattergrounds DB
import { all } from "@/app/lib/sql";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// --- Types ---

type QuestCategory =
  | "prime"
  | "ban"
  | "timeout"
  | "stream-time"
  | "insult"
  | "wordle"
  | "bandle"
  | "chat"   // New categories for chat quests
  | "game"
  | "social"
  | "love"
  | "interaction"
  | "brain"
  | "support"
  | "fun"
  | "creative"
  | "food"
  | "health"
  | "music";

type StreamQuest = {
  id: string;
  title: string;
  prompt: string;
  reward: number;
  category: QuestCategory;
  completed: boolean;
  completedAt?: string;
};

type ChatterQuest = {
  id: string;
  title: string;
  prompt: string;
  reward: number;
  completed: boolean;
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
  quests: StreamQuest[]; // Streamer quests
  
  // -- NEW CHATTER QUEST STATE --
  dailyQuestor: string; // The selected chatter name
  dailyQuestorId?: string; // Optional ID if known
  chatterQuests: ChatterQuest[]; // The 3 quests for the chatter
  chatterRerollCount: number; // CHANGED: Now a number instead of boolean
  
  ledger: Record<string, number>;
  lastAudienceHour: number;
  lastAudience: AudienceSnapshot;
};

type QuestVariable =
  | { key: string; type: "range"; min: number; max: number }
  | { key: string; type: "chatter" }
  | { key: string; type: "streamer" }; // New variable type

type QuestTemplateConfig = {
  id: string;
  category: QuestCategory;
  title: string;
  prompt: string;
  reward?: number;
  variables?: QuestVariable[];
};

// --- Config ---

const STREAM_QUESTS_DIR = path.join(process.cwd(), "data", "stream-quests");
const TEMPLATE_LIBRARY_PATH = path.join(process.cwd(), "data", "quest-library.json");
const CHAT_TEMPLATE_LIBRARY_PATH = path.join(process.cwd(), "data", "chat-quest-library.json");

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
    id: "stream-hours",
    category: "stream-time",
    title: "Stay Live",
    prompt: "Stream for more than {{hours}} hour{{plural:hours:s}}.",
    reward: 500,
    variables: [{ key: "hours", type: "range", min: 1, max: 5 }],
  },
];

type DbRecipient = { chatterId: string; login: string };
type TwitchSession = Awaited<ReturnType<typeof getValidSession>>;

// --- Helpers ---

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

// --- Routes ---

export async function GET() {
  const session = await getValidSession();

  // 1. Block if not logged in
  if (!session) {
    return jsonNoStore({ error: "unauthenticated" }, { status: 401 });
  }

  const audience = await loadAudience(session);

  // 2. Block if stream is not live
  if (audience.live === false) {
    return jsonNoStore(
      {
        error: "offline",
        message: "The Tavern is closed. You must be live to access quests.",
      },
      { status: 200 }
    );
  }

  const { state, regenerated } = await ensureState(audience, session.userId);

  return jsonNoStore({
    regenerated,
    ...serializeState(state),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { id?: string; action?: string }
    | null;

  const session = await getValidSession();
  if (!session) return jsonNoStore({ error: "unauthorized" }, { status: 401 });

  const broadcasterId = session.userId;
  const broadcasterLogin = (session.login || session.displayName).toLowerCase();
  const audience = await loadAudience(session);

  if (audience.live === false) {
    return jsonNoStore({ error: "offline", message: "The Tavern is closed." }, { status: 403 });
  }

  const { state } = await ensureState(audience, session.userId);
  const action = body?.action ?? (body?.id ? "claim" : undefined);

  // --- ACTION: REROLL STREAMER QUESTS ---
  if (action === "reroll") {
    const questTemplates = await loadQuestTemplates(TEMPLATE_LIBRARY_PATH);
    const newQuests = rerollIncompleteQuestsPreserveOrder(state.quests, audience, questTemplates);

    const rerolledState: StreamQuestState = {
      ...state,
      quests: newQuests,
      generatedAt: new Date().toISOString(),
      lastAudience: audience,
      lastAudienceHour: seedFromCurrentHour(),
    };

    await saveState(session.userId, rerolledState);
    return jsonNoStore({
      regenerated: true,
      ...serializeState(rerolledState),
    });
  }

  // --- ACTION: REROLL CHATTER QUESTOR (UPDATED FOR 3 ROLLS) ---
  if (action === "reroll_questor") {
    const currentCount = typeof state.chatterRerollCount === 'number' ? state.chatterRerollCount : 0;

    if (currentCount >= 3) {
        return jsonNoStore({ error: "No rerolls remaining" }, { status: 400 });
    }

    const chatTemplates = await loadQuestTemplates(CHAT_TEMPLATE_LIBRARY_PATH);
    const newQuestor = pickChatter(audience.names, [], [state.dailyQuestor]);
    const newChatterQuests = buildChatterQuests(newQuestor, audience, chatTemplates);

    const newState: StreamQuestState = {
        ...state,
        dailyQuestor: newQuestor,
        chatterQuests: newChatterQuests,
        chatterRerollCount: currentCount + 1, // Increment count
        lastAudience: audience
    }

    await saveState(session.userId, newState);
    return jsonNoStore({
        regenerated: true,
        ...serializeState(newState)
    });
  }

  // --- ACTION: CLAIM CHATTER QUEST ---
  if (action === "claim_chatter_quest") {
    if (!body?.id) return jsonNoStore({ error: "missing_id" }, { status: 400 });

    const questIndex = state.chatterQuests.findIndex(q => q.id === body.id);
    if (questIndex === -1) return jsonNoStore({ error: "quest_not_found" }, { status: 404 });
    
    const quest = state.chatterQuests[questIndex];
    if (quest.completed) return jsonNoStore({ alreadyCompleted: true, ...serializeState(state) });

    // Reward the SPECIFIC questor
    const targetChatter = state.dailyQuestor;
    
    // We try to find their ID if possible from the audience source, but falling back to name is handled by applyChattergroundsAction usually if name based
    await applyChattergroundsAction({
        action: "mint",
        chatterId: "0", // 0 implies name-based lookup or simple minting
        chatterLogin: targetChatter,
        amount: quest.reward
    }, { sessionUserId: broadcasterId });

    // Update Ledger
    const ledger = { ...state.ledger };
    ledger[targetChatter] = (ledger[targetChatter] ?? 0) + quest.reward;

    // Update State
    const updatedQuests = [...state.chatterQuests];
    updatedQuests[questIndex] = { ...quest, completed: true };

    const updatedState: StreamQuestState = {
        ...state,
        chatterQuests: updatedQuests,
        ledger
    };

    await saveState(session.userId, updatedState);
    return jsonNoStore({
        quest: updatedQuests[questIndex],
        recipient: targetChatter,
        ...serializeState(updatedState)
    });
  }

  // --- ACTION: COMPLETE STREAMER QUEST (Existing Logic) ---
  if (action === "claim") {
    if (!body?.id) return jsonNoStore({ error: "missing_id" }, { status: 400 });

    const quest = state.quests.find((entry) => entry.id === body.id);
    if (!quest) return jsonNoStore({ error: "quest_not_found" }, { status: 404 });
    if (quest.completed) return jsonNoStore({ alreadyCompleted: true, ...serializeState(state) });

    const recipients = await loadRecipientsFromChattergrounds(broadcasterId);

    // Reward Broadcaster
    await applyChattergroundsAction(
      {
        action: "quest-completed",
        chatterId: broadcasterId,
        chatterLogin: broadcasterLogin,
        amount: quest.reward,
      },
      { sessionUserId: broadcasterId }
    );

    // Reward Audience
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

    // Ledger Update
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

    await saveState(session.userId, updatedState);

    return jsonNoStore({
      quest: updatedQuest,
      recipients: [broadcasterLogin, ...others.map((r) => r.login)],
      totalRewarded: quest.reward * (others.length + 1),
      ...serializeState(updatedState),
    });
  }

  return jsonNoStore({ error: "bad_request" }, { status: 400 });
}

// --- Logic & State Management ---

async function ensureState(audience: AudienceSnapshot, userId: string) {
  const today = currentDateKey();
  const existing = await loadState(userId);
  const streamQuestTemplates = await loadQuestTemplates(TEMPLATE_LIBRARY_PATH);
  const chatQuestTemplates = await loadQuestTemplates(CHAT_TEMPLATE_LIBRARY_PATH);
  const currentHour = seedFromCurrentHour();

  if (existing && existing.date === today) {
    let stateDirty = false;
    let newState = { ...existing };

    // 1. Top up Streamer Quests if missing
    if (!Array.isArray(existing.quests) || existing.quests.length < 6) {
      newState.quests = topUpQuestsPreserveOrder(existing.quests ?? [], audience, streamQuestTemplates);
      stateDirty = true;
    }

    // 2. Initialize Chatter Quests if missing (Backwards compatibility for existing day)
    if (!existing.chatterQuests || existing.chatterQuests.length === 0 || !existing.dailyQuestor) {
        const questor = pickChatter(audience.names);
        newState.dailyQuestor = questor;
        newState.chatterQuests = buildChatterQuests(questor, audience, chatQuestTemplates);
        newState.chatterRerollCount = 0; // Init counter
        stateDirty = true;
    }

    if (stateDirty) {
        const finalizedState = {
            ...newState,
            generatedAt: new Date().toISOString(),
            lastAudience: audience,
            lastAudienceHour: currentHour,
        };
        await saveState(userId, finalizedState);
        return { state: finalizedState, regenerated: true };
    }

    // Just update audience metadata
    const updated: StreamQuestState = {
      ...existing,
      lastAudience: audience,
      lastAudienceHour: currentHour,
    };
    await saveState(userId, updated);
    return { state: updated, regenerated: false };
  }

  // --- NEW DAY GENERATION ---
  const quests = buildQuests(audience, streamQuestTemplates);
  
  // Pick Chatter Questor
  const dailyQuestor = pickChatter(audience.names);
  const chatterQuests = buildChatterQuests(dailyQuestor, audience, chatQuestTemplates);

  const state: StreamQuestState = {
    date: today,
    generatedAt: new Date().toISOString(),
    quests,
    dailyQuestor,
    chatterQuests,
    chatterRerollCount: 0, // Set starting count
    ledger: existing?.ledger ?? {},
    lastAudienceHour: currentHour,
    lastAudience: audience,
  };

  await saveState(userId, state);
  return { state, regenerated: true };
}

function sanitizeUserId(userId: string) {
  const safe = String(userId ?? "").trim();
  if (!safe) throw new Error("Missing Twitch user id");
  return safe.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getDataPath(userId: string) {
  const safeId = sanitizeUserId(userId);
  return path.join(STREAM_QUESTS_DIR, `${safeId}.json`);
}

async function loadState(userId: string): Promise<StreamQuestState | null> {
  try {
    const raw = await fs.readFile(getDataPath(userId), "utf8");
    const parsed = JSON.parse(raw) as StreamQuestState;
    if (!parsed.date || parsed.ledger === undefined) {
      return null;
    }

    // Handle migration from boolean to number
    let rerollCount = 0;
    if (typeof (parsed as any).chatterRerollCount === 'number') {
      rerollCount = (parsed as any).chatterRerollCount;
    } else if ((parsed as any).chatterRerollUsed) {
      rerollCount = 1;
    }

    return {
      ...parsed,
      quests: parsed.quests || [],
      chatterQuests: parsed.chatterQuests || [],
      dailyQuestor: parsed.dailyQuestor || "",
      chatterRerollCount: rerollCount,
      lastAudienceHour: parsed.lastAudienceHour ?? seedFromCurrentHour(),
      lastAudience: parsed.lastAudience ?? { names: [], source: "offline", live: false },
    };
  } catch {
    return null;
  }
}

async function saveState(userId: string, state: StreamQuestState) {
  const dataPath = getDataPath(userId);
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify(state, null, 2), "utf8");
}

function serializeState(state: StreamQuestState) {
  return {
    date: state.date,
    generatedAt: state.generatedAt,
    quests: state.quests,
    // Chatter specific data
    dailyQuestor: state.dailyQuestor,
    chatterQuests: state.chatterQuests,
    chatterRerollCount: state.chatterRerollCount,
    // General
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

function pickChatter(chatters: string[], fallback: string[] = [], exclude: string[] = []) {
  const pool = chatters.filter(n => !exclude.includes(n));
  const finalPool = pool.length ? pool : fallback;
  if (!finalPool.length) return "";
  return finalPool[Math.floor(Math.random() * finalPool.length)];
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

async function loadQuestTemplates(filePath: string): Promise<QuestTemplateConfig[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as QuestTemplateConfig[] | { templates?: QuestTemplateConfig[] };
    const templates = Array.isArray(parsed) ? parsed : parsed.templates;
    return (templates ?? []).map(sanitizeTemplateConfig).filter(Boolean) as QuestTemplateConfig[];
  } catch (error) {
    console.warn(`Stream quest: failed to load ${filePath}, using defaults.`, error);
  }
  return DEFAULT_TEMPLATE_LIBRARY;
}

function buildQuests(audience: AudienceSnapshot, library: QuestTemplateConfig[]): StreamQuest[] {
  if (library.length < 6) {
    // Fallback if library is broken
    return buildQuests(audience, DEFAULT_TEMPLATE_LIBRARY); 
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

function buildChatterQuests(questorName: string, audience: AudienceSnapshot, library: QuestTemplateConfig[]): ChatterQuest[] {
    const shuffled = [...library].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);
    
    return selected.map(template => {
        // We override specific vars to ensure they relate to context
        const variables = resolveVariables(template.variables ?? [], audience, questorName);
        const prompt = renderPrompt(template.prompt, variables);

        return {
            id: `${template.id}-${crypto.randomUUID()}`,
            title: template.title,
            prompt,
            reward: template.reward ?? 200,
            completed: false
        };
    });
}

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

  while (out.length < 6 && repIndex < replacements.length) {
    out.push(replacements[repIndex++]!);
  }

  return out;
}

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

function resolveVariables(variables: QuestVariable[], audience: AudienceSnapshot, excludeChatter?: string) {
  const values: Record<string, string | number> = {};

  variables.forEach((variable) => {
    if (variable.type === "range") {
      const min = Number.isFinite(variable.min) ? variable.min : 1;
      const max = Number.isFinite(variable.max) ? variable.max : min;
      values[variable.key] = randomBetween(min, max);
    }
    if (variable.type === "chatter") {
      const fallbackNames: string[] = [];
      // Ensure we don't pick the daily questor as the target of their own insult
      const excluded = excludeChatter ? [excludeChatter] : [];
      values[variable.key] = pickChatter(audience.names, fallbackNames, excluded);
    }
    if (variable.type === "streamer") {
        values[variable.key] = audience.displayName || "The Streamer";
    }
  });

  return values;
}

function sanitizeTemplateConfig(config: QuestTemplateConfig) {
  if (!config?.id || !config.title || !config.prompt) return null;
  return {
    ...config,
    variables: (config.variables ?? []).filter((variable) => {
      if (variable.type === "chatter" || variable.type === "streamer") return !!variable.key;
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
        names: [],
        source: "unauthenticated",
        live: false,
        note: "Link Twitch to use chattergrounds roster.",
      };
    }

    const recips = await loadRecipientsFromChattergrounds(session.userId);

    let names = recips.map((r) => r.login);
    if (names.length === 0) {
      const liveChatters = await fetchChatters(session);
      names = liveChatters.chatters?.map((login) => login.toLowerCase()) ?? [];
    }

    names = names.filter((login) => login && !BOT_LOGINS.has(login));
    const shuffledNames = shuffleWithSeed(names, seedFromCurrentHour());

    const liveCheck = await checkLiveStatus(session);
    const hasChatters = shuffledNames.length > 0;
    const live = hasChatters ? (liveCheck ?? true) : false;

    return {
      names: shuffledNames,
      source: "twitch",
      displayName: session.displayName,
      live,
      note: hasChatters ? undefined : "No live chatters available.",
    };
  } catch (error) {
    console.error("Stream quest: failed to load chattergrounds roster", error);
    return {
      names: [],
      source: "error",
      live: false,
      note: "Failed to load roster.",
    };
  }
}
