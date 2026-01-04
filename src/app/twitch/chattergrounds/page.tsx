import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { getValidSession } from "@/app/lib/twitch-auth";
// Import the database logic from your chattergrounds route
import { applyChattergroundsAction } from "@/app/api/twitch/chattergrounds/route";

// NEW: query chattergrounds directly (so we never touch /api/twitch/chatters)
import { all } from "@/app/lib/sql";

export const dynamic = "force-dynamic";

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

// Don’t reward bots / service accounts (customize as you like)
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

// --- NEW: read recipients ONLY from chattergrounds_stats (numeric chatter_id only) ---
type DbRecipient = { chatterId: string; login: string };

async function loadRecipientsFromChattergrounds(broadcasterId: string): Promise<DbRecipient[]> {
  // Only numeric chatter_id rows are “real Twitch IDs”
  const rows = (await all(
    `
    SELECT chatter_id, name
    FROM chattergrounds_stats
    WHERE broadcaster_id = ?
      AND chatter_id GLOB '[0-9]*'
    ORDER BY updated_at DESC
    `,
    [broadcasterId]
  )) as any[];

  const seenIds = new Set<string>();
  const recipients: DbRecipient[] = [];

  for (const r of rows ?? []) {
    const chatterId = String(r?.chatter_id ?? "").trim();
    if (!chatterId) continue;

    const login = String(r?.name ?? "").trim().toLowerCase();
    if (!login) continue;
    if (BOT_LOGINS.has(login)) continue;

    if (seenIds.has(chatterId)) continue;
    seenIds.add(chatterId);

    recipients.push({ chatterId, login });
  }

  return recipients;
}

export async function GET() {
  const audience = await loadAudience();
  const { state, regenerated } = await ensureState(audience);

  return NextResponse.json({
    regenerated,
    ...serializeState(state),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const session = await getValidSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // IMPORTANT: audience for quests now comes from chattergrounds DB (not chatters API)
  const audience = await loadAudience();
  const { state } = await ensureState(audience);

  const quest = state.quests.find((entry) => entry.id === body.id);
  if (!quest) {
    return NextResponse.json({ error: "quest_not_found" }, { status: 404 });
  }

  if (quest.completed) {
    return NextResponse.json({ alreadyCompleted: true, ...serializeState(state) });
  }

  const completedAt = new Date().toISOString();

  // Broadcaster identity
  const broadcasterLogin = (session.login || session.displayName || "broadcaster").toLowerCase();
  const broadcasterId = session.userId;

  // Record quest completion ONLY for broadcaster (your original intention)
  await applyChattergroundsAction(
    {
      action: "quest-completed",
      chatterId: broadcasterId, // numeric twitch id
      chatterLogin: broadcasterLogin,
      amount: 1,
    },
    { sessionUserId: session.userId }
  );

  // --- Reward ONLY people who already exist in chattergrounds_stats ---
  let recipients = await loadRecipientsFromChattergrounds(session.userId);

  // Ensure broadcaster is included even if not in the list yet
  if (!recipients.some((r) => r.chatterId === broadcasterId)) {
    recipients = [{ chatterId: broadcasterId, login: broadcasterLogin }, ...recipients];
  }

  // Mint quest reward to each DB recipient (no new “invented” rows)
  const BATCH_SIZE = 10;
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (r) => {
        await applyChattergroundsAction(
          {
            action: "mint",
            chatterId: r.chatterId, // ALWAYS numeric id from DB
            chatterLogin: r.login,
            amount: quest.reward,
          },
          { sessionUserId: session.userId }
        );
      })
    );
  }

  // Update the local JSON ledger for display
  const ledger = { ...state.ledger };
  for (const r of recipients) {
    ledger[r.login] = (ledger[r.login] ?? 0) + quest.reward;
  }

  const updatedQuest: StreamQuest = { ...quest, completed: true, completedAt };
  const updatedState: StreamQuestState = {
    ...state,
    quests: state.quests.map((entry) => (entry.id === quest.id ? updatedQuest : entry)),
    ledger,
    lastAudience: audience,
  };

  await saveState(updatedState);

  return NextResponse.json({
    quest: updatedQuest,
    recipients: recipients.map((r) => r.login),
    totalRewarded: quest.reward * recipients.length,
    ...serializeState(updatedState),
  });
}

async function ensureState(audience: AudienceSnapshot) {
  const today = currentDateKey();
  const existing = await loadState();
  const questTemplates = await loadQuestTemplates();
  const currentHour = seedFromCurrentHour();

  if (existing && existing.date === today) {
    const hasAudienceChanged =
      JSON.stringify(audience) !== JSON.stringify(existing.lastAudience) ||
      existing.lastAudienceHour !== currentHour;
    const upgradedToTwitch = audience.source === "twitch" && existing.lastAudience?.source !== "twitch";
    const insufficientQuests = existing.quests.length < 6;
    const audienceRegenerated = audience.source === "twitch" && hasAudienceChanged;
    const shouldRegenerate = upgradedToTwitch || insufficientQuests || audienceRegenerated;

    if (shouldRegenerate) {
      const quests = regenerateQuestsPreservingCompletions(existing.quests, audience, questTemplates);
      const regeneratedState: StreamQuestState = {
        ...existing,
        quests,
        generatedAt: new Date().toISOString(),
        lastAudience: audience,
        lastAudienceHour: currentHour,
      };
      await saveState(regeneratedState);
      return { state: regeneratedState, regenerated: true };
    }

    const updated = { ...existing, lastAudience: audience, lastAudienceHour: currentHour };
    const shouldPersist =
      JSON.stringify(updated.lastAudience) !== JSON.stringify(existing.lastAudience) ||
      updated.lastAudienceHour !== existing.lastAudienceHour;
    if (shouldPersist) {
      await saveState(updated);
    }
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
      lastAudience: parsed.lastAudience ?? { names: FALLBACK_CHATTERS, source: "fallback" },
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

function regenerateQuestsPreservingCompletions(
  existingQuests: StreamQuest[],
  audience: AudienceSnapshot,
  library: QuestTemplateConfig[]
) {
  const completed = existingQuests.filter((quest) => quest.completed);
  const needed = Math.max(0, 6 - completed.length);
  const replacements = buildQuests(audience, library).slice(0, needed);
  return [...completed, ...replacements];
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

// IMPORTANT: audience now comes from chattergrounds DB, not Twitch chatters API
async function loadAudience(): Promise<AudienceSnapshot> {
  let session: Awaited<ReturnType<typeof getValidSession>> = null;
  try {
    session = await getValidSession();
    if (!session) {
      return {
        names: FALLBACK_CHATTERS,
        source: "unauthenticated",
        note: "Link Twitch to use chattergrounds roster. Using placeholders for now.",
      };
    }

    const recipients = await loadRecipientsFromChattergrounds(session.userId);
    const names = shuffleWithSeed(
      recipients.map((r) => r.login),
      seedFromCurrentHour()
    );

    return {
      names,
      source: "twitch",
      displayName: session.displayName,
      live: true,
      note: names.length === 0 ? "No chattergrounds users yet (no messages recorded yet)." : undefined,
    };
  } catch (error) {
    console.error("Stream quest: failed to load chattergrounds roster", error);
    if (session) {
      return {
        names: [],
        source: "error",
        displayName: session.displayName,
        live: false,
        note: "DB error while loading chattergrounds roster.",
      };
    }
    return {
      names: FALLBACK_CHATTERS,
      source: "fallback",
      note: "Using fallback names due to error.",
    };
  }
}
