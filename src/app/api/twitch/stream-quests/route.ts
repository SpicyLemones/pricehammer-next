import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { fetchChatters, getValidSession } from "@/app/lib/twitch-auth";

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

  const audience = await loadAudience();
  const { state } = await ensureState(audience);

  const quest = state.quests.find((entry) => entry.id === body.id);
  if (!quest) {
    return NextResponse.json({ error: "quest_not_found" }, { status: 404 });
  }

  if (quest.completed) {
    return NextResponse.json({
      alreadyCompleted: true,
      ...serializeState(state),
    });
  }

  const completedAt = new Date().toISOString();
  const recipients = new Set(audience.names.length ? audience.names : ["everyone"]);

  const ledger = { ...state.ledger };
  recipients.forEach((name) => {
    ledger[name] = (ledger[name] ?? 0) + quest.reward;
  });

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
    recipients: Array.from(recipients),
    totalRewarded: updatedQuest.reward * recipients.size,
    audience,
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
    const upgradedToTwitch =
      audience.source === "twitch" && existing.lastAudience?.source !== "twitch";
    const shouldRegenerate = upgradedToTwitch || (audience.source === "twitch" && hasAudienceChanged);

    if (shouldRegenerate) {
      const quests = buildQuests(audience, questTemplates);
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
    if (sanitized.length >= 5) return sanitized;
    if (sanitized.length > 0) {
      console.warn("Stream quest: not enough templates in quest-library.json, falling back to defaults.");
    }
  } catch (error) {
    console.warn("Stream quest: failed to load quest-library.json, using defaults.", error);
  }
  return DEFAULT_TEMPLATE_LIBRARY;
}

function buildQuests(audience: AudienceSnapshot, library: QuestTemplateConfig[]): StreamQuest[] {
  if (library.length < 5) {
    throw new Error("At least 5 quest templates are required to build a daily set.");
  }
  const shuffled = [...library].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 5);

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
          ? [audience.displayName].filter(Boolean) as string[]
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

async function loadAudience(): Promise<AudienceSnapshot> {
  let session: Awaited<ReturnType<typeof getValidSession>> = null;
  try {
    session = await getValidSession();
    if (!session) {
      return {
        names: FALLBACK_CHATTERS,
        source: "unauthenticated",
        note: "Link Twitch to pull live chatters. Using placeholders for now.",
      };
    }

    const chatters = await fetchChatters(session);
    if (!chatters.live) {
      return {
        names: [session.displayName].filter(Boolean) as string[],
        source: "offline",
        displayName: chatters.displayName,
        live: false,
        note: "Stream is offline.",
      };
    }

    const names = chatters.chatters ?? [];
    const shuffled = shuffleWithSeed(names, seedFromCurrentHour());
    return {
      names: shuffled,
      source: "twitch",
      displayName: chatters.displayName,
      live: true,
      note: names.length === 0 ? "No chatters returned for this hour." : undefined,
    };
  } catch (error) {
    console.error("Stream quest: failed to load chatters", error);
    if (session) {
      return {
        names: [],
        source: "error",
        displayName: session.displayName,
        live: false,
        note: "Twitch error while loading chatters.",
      };
    }
    return {
      names: FALLBACK_CHATTERS,
      source: "fallback",
      note: "Using fallback names due to Twitch error.",
    };
  }
}
