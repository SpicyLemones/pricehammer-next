import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

type RangeKey = "today" | "week" | "month" | "all";

type MessagePoint = {
  timestamp: string;
  messages: number;
};

type ChatterStats = {
  toadcoins: number;
  toadcoinsMinted: number;
  timesBanned: number;
  timesTimedOut: number;
  questsCompleted: number;
  messagesSent: number;
  estimatedAge: number;
  monthsSubbed: number;
  donosGifted: number;
  favoriteWord: string;
  favoriteEmote: string;
};

type ChatterProfile = {
  id: string;
  name: string;
  flair: string;
  lastMessage: string;
  stats: ChatterStats;
};

type ChattergroundsData = {
  updatedAt: string;
  origin: "twitch" | "offline" | "seed";
  chatters: ChatterProfile[];
  messageSeries: Record<RangeKey, MessagePoint[]>;
  toadcoin: {
    totalMinted: number;
    circulating: number;
    vault: number;
    ledger: Record<string, number>;
  };
};

type PersistAction =
  | {
      action: "mint";
      chatterId: string;
      amount: number;
    }
  | {
      action: "record-message";
      chatterId: string;
      message?: string;
    };

const DATA_PATH = path.join(process.cwd(), "data", "chattergrounds.json");
const RANGE_KEYS: RangeKey[] = ["today", "week", "month", "all"];

export const dynamic = "force-dynamic";

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function buildSeries(pointCount: number, stepMinutes: number, base: number): MessagePoint[] {
  return Array.from({ length: pointCount }).map((_, idx) => {
    const timestamp = minutesAgo((pointCount - idx) * stepMinutes);
    const drift = Math.sin(idx / 3) * 4;
    const variance = randomBetween(-3, 6);
    const messages = Math.max(0, Math.round(base + drift + variance + idx * 0.5));
    return { timestamp: timestamp.toISOString(), messages };
  });
}

function buildChatters(): ChatterProfile[] {
  const names = [
    "SpycyToast",
    "FrogOfTheNorth",
    "ModMatrix",
    "LaggyMage",
    "PixelPanda",
    "NyaaCoder",
    "BanHammered",
    "QuestGoblin",
    "HoverTank",
    "ChonkKnight",
    "MidnightMoth",
    "DataDruid",
  ];

  const lastMessages = [
    "!doubledown let's go",
    "brb grabbing snacks",
    "copium stock is UP",
    "this quest is impossible",
    "mod check??",
    "kekw",
    "pog toadcoin pump",
    "hydrate or diedrate",
    "who banned me last time??",
    "gachiHYPER",
    "do a barrel roll",
    "ayo that drop was clean",
  ];

  const words = ["copium", "pog", "toadcoin", "wizard", "bruh", "gaming", "greed", "tilt", "vibe", "gg"]; 
  const emotes = ["Kappa", "PogChamp", "FeelsStrongMan", "peepoHappy", "CatJAM", "LUL", "BibleThump", "OMEGALUL", "PepeLaugh", "ResidentSleeper"];

  return names.map((name, idx) => {
    const baseMessages = randomBetween(1400, 5200);
    const timesBanned = randomBetween(0, 12);
    const timesTimedOut = randomBetween(timesBanned, timesBanned + 20);
    const minted = randomBetween(500, 4200);

    return {
      id: `chatter-${idx + 1}`,
      name,
      flair: idx % 3 === 0 ? "day-one" : idx % 2 === 0 ? "vip" : "regular",
      lastMessage: lastMessages[idx] ?? "",
      stats: {
        toadcoins: randomBetween(200, 1200),
        toadcoinsMinted: minted,
        timesBanned,
        timesTimedOut,
        questsCompleted: randomBetween(2, 35),
        messagesSent: baseMessages,
        estimatedAge: randomBetween(12, 80),
        monthsSubbed: randomBetween(0, 36),
        donosGifted: randomBetween(0, 75),
        favoriteWord: sample(words),
        favoriteEmote: sample(emotes),
      },
    } satisfies ChatterProfile;
  });
}

function createSeedData(): ChattergroundsData {
  const chatters = buildChatters();
  const totalMinted = chatters.reduce((sum, chatter) => sum + chatter.stats.toadcoinsMinted, 0);

  const messageSeries: Record<RangeKey, MessagePoint[]> = {
    today: buildSeries(32, 30, 18),
    week: buildSeries(42, 240, 35),
    month: buildSeries(48, 720, 42),
    all: buildSeries(52, 1440, 20),
  };

  return {
    updatedAt: new Date().toISOString(),
    origin: "offline",
    chatters,
    messageSeries,
    toadcoin: {
      totalMinted,
      circulating: Math.round(totalMinted * 0.82),
      vault: Math.round(totalMinted * 0.18),
      ledger: Object.fromEntries(chatters.map((chatter) => [chatter.id, chatter.stats.toadcoinsMinted])),
    },
  } satisfies ChattergroundsData;
}

async function readPersistedData(): Promise<ChattergroundsData | null> {
  try {
    const file = await fs.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(file) as ChattergroundsData;
    return parsed;
  } catch (error) {
    console.warn("Chattergrounds seed missing, generating fresh data", error);
    return null;
  }
}

async function persistData(data: ChattergroundsData) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
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

async function getData(): Promise<ChattergroundsData> {
  const persisted = await readPersistedData();
  if (persisted) {
    return normalizeData(persisted);
  }

  const seed = createSeedData();
  await persistData(seed);
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
    lastMessage: "Freshly arrived in chat",
    stats: {
      toadcoins: 0,
      toadcoinsMinted: 0,
      timesBanned: 0,
      timesTimedOut: 0,
      questsCompleted: 0,
      messagesSent: 0,
      estimatedAge: randomBetween(12, 80),
      monthsSubbed: 0,
      donosGifted: 0,
      favoriteWord: "hello",
      favoriteEmote: "Kappa",
    },
  };

  data.chatters.push(placeholder);
  return placeholder;
}

export async function GET() {
  const data = await getData();
  return NextResponse.json({
    data,
    note: "Currently seeded with offline-friendly chatter analytics. Swap to Twitch API when tokens are wired up.",
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

  const data = await getData();
  const nowIso = new Date().toISOString();

  if (payload.action === "mint") {
    const { chatterId, amount } = payload;
    if (!chatterId || typeof amount !== "number" || Number.isNaN(amount)) {
      return NextResponse.json({ error: "Invalid mint payload" }, { status: 400 });
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
      return NextResponse.json({ error: "Missing chatterId" }, { status: 400 });
    }

    const chatter = findOrCreateChatter(data, chatterId);
    chatter.lastMessage = message?.slice(0, 240) || chatter.lastMessage || "Sent a message";
    chatter.stats.messagesSent += 1;
    touchMessageSeries(data.messageSeries, 1);
  } else {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  data.updatedAt = nowIso;
  await persistData(normalizeData(data));

  return NextResponse.json({ ok: true, data });
}
