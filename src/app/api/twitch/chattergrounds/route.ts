import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { fetchChatters, getValidSession } from "@/app/lib/twitch-auth";

type RangeKey = "today" | "week" | "month" | "all";

type MessagePoint = {
  timestamp: string;
  messages: number;
};

type ChatterStats = {
  toadcoins: number;
  toadcoinsMinted: number;
  timesBanned: number | null;
  timesTimedOut: number | null;
  questsCompleted: number | null;
  messagesSent: number;
  estimatedAge: number;
  monthsSubbed: number | null;
  donosGifted: number | null;
  favoriteWord: string | null;
  favoriteEmote: string | null;
};

type ChatterProfile = {
  id: string;
  name: string;
  flair: string;
  lastMessage: string | null;
  stats: ChatterStats;
};

type ChattergroundsData = {
  updatedAt: string;
  origin: "twitch" | "offline" | "seed" | "fallback";
  chatters: ChatterProfile[];
  messageSeries: Record<RangeKey, MessagePoint[]>;
  toadcoin: {
    totalMinted: number;
    circulating: number;
    vault: number;
    ledger: Record<string, number>;
  };
  owner?: {
    userId?: string;
    login?: string;
    displayName?: string;
  };
};

export type PersistAction =
  | {
      action: "mint";
      chatterId: string;
      amount: number;
    }
  | {
      action: "record-message";
      chatterId: string;
      message?: string;
    }
  | {
      action: "ban";
      chatterId: string;
    }
  | {
      action: "timeout";
      chatterId: string;
    }
  | {
      action: "quest-completed";
      chatterId: string;
      amount?: number;
    }
  | {
      action: "sub-months";
      chatterId: string;
      months: number;
    };

const DATA_PATH = path.join(process.cwd(), "data", "chattergrounds.json");
const RANGE_KEYS: RangeKey[] = ["today", "week", "month", "all"];
const DATA_DIR = path.join(process.cwd(), "data", "chattergrounds");

export const dynamic = "force-dynamic";

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildChatters(sourceNames?: string[]): ChatterProfile[] {
  const names = sourceNames ?? [];

  return names.map((name, idx) => ({
    id: `chatter-${idx + 1}`,
    name,
    flair: "regular",
    lastMessage: null,
    stats: {
      toadcoins: 0,
      toadcoinsMinted: 0,
      timesBanned: null,
      timesTimedOut: null,
      questsCompleted: null,
      messagesSent: 0,
      estimatedAge: randomBetween(12, 80),
      monthsSubbed: null,
      donosGifted: null,
      favoriteWord: null,
      favoriteEmote: null,
    },
  }));
}

function createSeedData(options?: {
  names?: string[];
  origin?: ChattergroundsData["origin"];
  owner?: ChattergroundsData["owner"];
}): ChattergroundsData {
  const chatters = buildChatters(options?.names);
  const totalMinted = chatters.reduce((sum, chatter) => sum + chatter.stats.toadcoinsMinted, 0);

  const messageSeries: Record<RangeKey, MessagePoint[]> = {
    today: [],
    week: [],
    month: [],
    all: [],
  };

  return {
    updatedAt: new Date().toISOString(),
    origin: options?.origin ?? "offline",
    chatters,
    messageSeries,
    toadcoin: {
      totalMinted,
      circulating: 0,
      vault: 0,
      ledger: Object.fromEntries(chatters.map((chatter) => [chatter.id, chatter.stats.toadcoinsMinted])),
    },
    owner: options?.owner,
  } satisfies ChattergroundsData;
}

function resolveDataPath(userId?: string) {
  if (!userId) return DATA_PATH;
  return path.join(DATA_DIR, `${userId}.json`);
}

async function readPersistedData(userId?: string): Promise<ChattergroundsData | null> {
  try {
    const file = await fs.readFile(resolveDataPath(userId), "utf8");
    const parsed = JSON.parse(file) as ChattergroundsData;
    return parsed;
  } catch (error) {
    console.warn("Chattergrounds seed missing, generating fresh data", error);
    return null;
  }
}

async function persistData(data: ChattergroundsData, userId?: string) {
  const targetPath = resolveDataPath(userId);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeData(data: ChattergroundsData): ChattergroundsData {
  const safeChatters = data.chatters.map((chatter, idx) => ({
    ...chatter,
    id: chatter.id ?? `chatter-${idx + 1}`,
    stats: {
      ...chatter.stats,
      estimatedAge: Math.min(80, Math.max(12, chatter.stats.estimatedAge ?? randomBetween(12, 80))),
    },
  }));

  const ledger = { ...data.toadcoin.ledger };
  safeChatters.forEach((chatter) => {
    if (!ledger[chatter.id]) {
      ledger[chatter.id] = chatter.stats.toadcoinsMinted;
    }
  });

  const normalized: ChattergroundsData = {
    ...data,
    chatters: safeChatters,
    toadcoin: {
      ...data.toadcoin,
      ledger,
    },
    messageSeries: {
      today: data.messageSeries.today ?? [],
      week: data.messageSeries.week ?? [],
      month: data.messageSeries.month ?? [],
      all: data.messageSeries.all ?? [],
    },
  };

  return normalized;
}

export async function getData(options?: {
  userId?: string;
  owner?: ChattergroundsData["owner"];
  seedNames?: string[];
  origin?: ChattergroundsData["origin"];
}): Promise<ChattergroundsData> {
  const persisted = await readPersistedData(options?.userId);
  if (persisted) {
    return normalizeData(persisted);
  }

  const seed = createSeedData({
    names: options?.seedNames,
    origin: options?.origin,
    owner: options?.owner,
  });
  await persistData(seed, options?.userId);
  return seed;
}

function touchMessageSeries(series: Record<RangeKey, MessagePoint[]>, messageIncrement = 1) {
  const now = new Date();
  const minuteBucket = new Date(now);
  minuteBucket.setSeconds(0, 0);
  const minuteIso = minuteBucket.toISOString();

  const windows: Record<RangeKey, number> = {
    today: 24 * 60,
    week: 7 * 24 * 60,
    month: 30 * 24 * 60,
    all: 180 * 24 * 60,
  };

  RANGE_KEYS.forEach((key) => {
    const cutoff = Date.now() - windows[key] * 60 * 1000;
    const filtered = (series[key] ?? []).filter((point) => new Date(point.timestamp).getTime() >= cutoff);
    const existing = filtered.find((point) => point.timestamp === minuteIso);

    if (existing) {
      existing.messages += messageIncrement;
    } else {
      filtered.push({ timestamp: minuteIso, messages: messageIncrement });
    }

    series[key] = filtered
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-1200); // prevent unbounded growth
  });
}

function findOrCreateChatter(data: ChattergroundsData, chatterId: string): ChatterProfile {
  const existing = data.chatters.find((entry) => entry.id === chatterId);
  if (existing) return existing;

  const placeholder: ChatterProfile = {
    id: chatterId,
    name: chatterId.replace(/[-_]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || "New Chatter",
    flair: "new",
    lastMessage: null,
    stats: {
      toadcoins: 0,
      toadcoinsMinted: 0,
      timesBanned: null,
      timesTimedOut: null,
      questsCompleted: null,
      messagesSent: 0,
      estimatedAge: randomBetween(12, 80),
      monthsSubbed: null,
      donosGifted: null,
      favoriteWord: null,
      favoriteEmote: null,
    },
  };

  data.chatters.push(placeholder);
  return placeholder;
}

type ApplyContext = {
  sessionUserId?: string;
  owner?: ChattergroundsData["owner"];
  origin?: ChattergroundsData["origin"];
};

function incrementNullable(value: number | null | undefined, amount = 1) {
  return (value ?? 0) + amount;
}

export async function applyChattergroundsAction(
  payload: PersistAction,
  context: ApplyContext = {}
): Promise<ChattergroundsData | { error: string }> {
  const data = await getData({
    userId: context.sessionUserId,
    owner: context.owner,
    origin: context.origin,
  });
  const nowIso = new Date().toISOString();

  if (payload.action === "mint") {
    const { chatterId, amount } = payload;
    if (!chatterId || typeof amount !== "number" || Number.isNaN(amount)) {
      return { error: "Invalid mint payload" };
    }

    const safeAmount = Math.max(-1000000, Math.min(1000000, Math.round(amount)));
    const chatter = findOrCreateChatter(data, chatterId);

    chatter.stats.toadcoins += safeAmount;
    chatter.stats.toadcoinsMinted += safeAmount;
    data.toadcoin.totalMinted += safeAmount;
    data.toadcoin.circulating = Math.max(0, data.toadcoin.circulating + safeAmount * 0.92);
    data.toadcoin.vault = Math.max(0, data.toadcoin.totalMinted - data.toadcoin.circulating);
    data.toadcoin.ledger[chatterId] = (data.toadcoin.ledger[chatterId] ?? 0) + safeAmount;
  } else if (payload.action === "record-message") {
    const { chatterId, message } = payload;
    if (!chatterId) {
      return { error: "Missing chatterId" };
    }

    const chatter = findOrCreateChatter(data, chatterId);
    chatter.lastMessage = message?.slice(0, 240) || chatter.lastMessage || null;
    chatter.stats.messagesSent += 1;
    touchMessageSeries(data.messageSeries, 1);
  } else if (payload.action === "ban") {
    const { chatterId } = payload;
    if (!chatterId) return { error: "Missing chatterId" };
    const chatter = findOrCreateChatter(data, chatterId);
    chatter.stats.timesBanned = incrementNullable(chatter.stats.timesBanned);
  } else if (payload.action === "timeout") {
    const { chatterId } = payload;
    if (!chatterId) return { error: "Missing chatterId" };
    const chatter = findOrCreateChatter(data, chatterId);
    chatter.stats.timesTimedOut = incrementNullable(chatter.stats.timesTimedOut);
  } else if (payload.action === "quest-completed") {
    const { chatterId, amount } = payload;
    if (!chatterId) return { error: "Missing chatterId" };
    const chatter = findOrCreateChatter(data, chatterId);
    chatter.stats.questsCompleted = incrementNullable(chatter.stats.questsCompleted, amount ?? 1);
  } else if (payload.action === "sub-months") {
    const { chatterId, months } = payload;
    if (!chatterId || typeof months !== "number" || Number.isNaN(months)) {
      return { error: "Invalid subscription payload" };
    }
    const chatter = findOrCreateChatter(data, chatterId);
    chatter.stats.monthsSubbed = Math.max(chatter.stats.monthsSubbed ?? 0, Math.max(0, Math.round(months)));
  } else {
    return { error: "Unsupported action" };
  }

  data.updatedAt = nowIso;
  await persistData(normalizeData(data), context.sessionUserId);

  return data;
}

export async function GET() {
  const session = await getValidSession();
  const owner = session
    ? { userId: session.userId, login: session.login, displayName: session.displayName }
    : undefined;

  let chattersFromTwitch: string[] | undefined;
  let origin: ChattergroundsData["origin"] = session ? "twitch" : "offline";

  if (session) {
    try {
      const chatters = await fetchChatters(session);
      chattersFromTwitch = chatters.chatters;
      origin = chatters.live ? "twitch" : "seed";
    } catch (error) {
      console.error("Falling back to offline chatter seed", error);
      origin = "fallback";
    }
  }

  const data = await getData({
    userId: session?.userId,
    seedNames: chattersFromTwitch,
    origin,
    owner,
  });

  return NextResponse.json({
    data,
    note: session
      ? "Twitch-connected. Using your channel chatters and persisting per broadcaster."
      : "Offline seed. Connect Twitch to hydrate with your real chatters.",
  });
}

export async function POST(request: Request) {
  let payload: PersistAction;
  try {
    payload = (await request.json()) as PersistAction;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Missing action payload" }, { status: 400 });
  }

  const session = await getValidSession();
  const owner = session
    ? { userId: session.userId, login: session.login, displayName: session.displayName }
    : undefined;
  const result = await applyChattergroundsAction(payload, {
    sessionUserId: session?.userId,
    owner,
    origin: session ? "twitch" : "offline",
  });

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: result });
}
