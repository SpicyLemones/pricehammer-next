"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ActivitySquare,
  ArrowUpRight,
  BadgeInfo,
  BarChart3,
  Crown,
  Flame,
  Ghost,
  Loader2,
  Medal,
  MessageSquare,
  RefreshCcw,
  Sparkles,
  Trophy,
} from "lucide-react";
import clsx from "clsx";

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

type ApiResponse = {
  data: ChattergroundsData;
  note?: string;
};

const rangeLabels: Record<RangeKey, string> = {
  today: "Today",
  week: "7 Days",
  month: "1 Month",
  all: "All",
};

const flairStyles: Record<string, string> = {
  vip: "bg-gradient-to-r from-amber-500/90 via-amber-400 to-yellow-300 text-slate-900 shadow-lg shadow-amber-500/30",
  "day-one": "bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 text-white shadow-lg shadow-purple-500/30",
  regular: "bg-slate-800 text-slate-100 shadow-inner shadow-slate-900",
  new: "bg-emerald-600 text-white shadow-lg shadow-emerald-500/30",
};

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function formatTimeAgo(iso: string) {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / (60 * 1000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function areaPath(points: MessagePoint[], width: number, height: number) {
  if (!points.length) return "";
  const maxMessages = Math.max(...points.map((p) => p.messages), 1);
  const stepX = width / Math.max(points.length - 1, 1);

  const coords = points.map((p, idx) => {
    const x = idx * stepX;
    const y = height - (p.messages / maxMessages) * height;
    return [x, y] as const;
  });

  let d = `M 0 ${height}`;
  coords.forEach(([x, y], idx) => {
    if (idx === 0) {
      d += ` L ${x} ${y}`;
    } else {
      const prev = coords[idx - 1];
      const cx = (prev[0] + x) / 2;
      d += ` C ${cx} ${prev[1]} ${cx} ${y} ${x} ${y}`;
    }
  });
  d += ` L ${width} ${height} Z`;
  return d;
}

function Leaderboard({
  title,
  icon: Icon,
  items,
  accent,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  items: { name: string; score: number; flair?: string }[];
  accent: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/40 backdrop-blur">
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-slate-700/30 to-slate-800/5 blur-3xl transition-all duration-500 group-hover:translate-y-1 group-hover:scale-110" />
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
        <Icon className={clsx("h-4 w-4", accent)} />
        <span>{title}</span>
      </div>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li
            key={`${item.name}-${idx}`}
            className="group/item flex items-center justify-between rounded-xl bg-slate-900/80 px-3 py-2 text-sm text-slate-100 transition-all duration-200 hover:-translate-y-[1px] hover:bg-slate-800/90 hover:shadow-lg hover:shadow-black/40"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800/80 text-xs font-bold text-amber-100">
                {idx + 1}
              </span>
              <div className="flex flex-col">
                <span className="font-semibold">{item.name}</span>
                {item.flair && (
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">
                    {item.flair}
                  </span>
                )}
              </div>
            </div>
            <span className={clsx("font-semibold", accent)}>{formatNumber(item.score)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ChattergroundsPage() {
  const [range, setRange] = useState<RangeKey>("today");
  const [selectedChatter, setSelectedChatter] = useState<ChatterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChattergroundsData | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/twitch/chattergrounds", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load chatter data");
        const json = (await res.json()) as ApiResponse;
        setData(json.data);
        setSelectedChatter(json.data.chatters[0] ?? null);
      } catch (err) {
        console.error(err);
        setError("Could not load chatter analytics. Try refreshing.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const series = useMemo(() => data?.messageSeries[range] ?? [], [data, range]);
  const banned = useMemo(
    () => (data?.chatters ?? []).slice().sort((a, b) => b.stats.timesBanned - a.stats.timesBanned).slice(0, 10),
    [data],
  );
  const timeouts = useMemo(
    () => (data?.chatters ?? []).slice().sort((a, b) => b.stats.timesTimedOut - a.stats.timesTimedOut).slice(0, 10),
    [data],
  );
  const messages = useMemo(
    () => (data?.chatters ?? []).slice().sort((a, b) => b.stats.messagesSent - a.stats.messagesSent).slice(0, 10),
    [data],
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.08),transparent_25%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.1),transparent_25%),radial-gradient(circle_at_40%_80%,rgba(244,114,182,0.06),transparent_30%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] via-transparent to-black/40" />

      <Link
        href="/twitch"
        className="fixed left-4 top-4 z-50 flex items-center gap-2 rounded-full border border-slate-800/60 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-100 shadow-lg shadow-black/40 backdrop-blur transition hover:-translate-y-[1px] hover:border-slate-700 hover:bg-slate-800/90 hover:text-emerald-200"
      >
        ← Back to Twitch Toybox
      </Link>

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-16 pt-20 md:px-8 lg:px-10">
        <header className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-emerald-200">
              <ActivitySquare className="h-4 w-4" />
              <span>Chattergrounds</span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white drop-shadow-lg md:text-5xl">
              Live Chatter Intelligence
            </h1>
            <p className="max-w-2xl text-base text-slate-300">
              Watch the yap graph pulse in real time, peek at ban legends, and drill into your favorite weirdos. All stats
              are seeded locally until Twitch tokens are wired up.
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800/70 bg-slate-900/70 px-3 py-2 shadow-inner shadow-black/40">
            <Sparkles className="h-4 w-4 text-amber-300" />
            <span className="text-sm text-slate-200">Updated {data ? formatTimeAgo(data.updatedAt) : "now"}</span>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950/60 shadow-2xl shadow-black/50">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 bg-slate-900/70 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-200">
                  <Flame className="h-4 w-4 text-amber-400" />
                  <span>Yap Graph</span>
                </div>
                <div className="flex items-center gap-1 rounded-full bg-slate-800/80 p-1 shadow-inner shadow-black/50">
                  {(Object.keys(rangeLabels) as RangeKey[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => setRange(key)}
                      className={clsx(
                        "rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200",
                        range === key
                          ? "bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/40"
                          : "text-slate-300 hover:bg-slate-700/80",
                      )}
                    >
                      {rangeLabels[key]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative px-4 pb-6 pt-4">
                <div className="absolute inset-6 rounded-2xl bg-gradient-to-br from-emerald-500/5 via-transparent to-indigo-500/5 blur-3xl" />
                <div className="relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4 shadow-inner shadow-black/50">
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
                    <span>{series.length} data points</span>
                    <div className="flex items-center gap-2">
                      <div className="flex h-2 w-2 items-center justify-center rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/40" />
                      <span>messages / minute</span>
                    </div>
                  </div>
                  <svg className="h-64 w-full" viewBox="0 0 600 260" role="presentation">
                    <defs>
                      <linearGradient id="yapFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#1e293b" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={areaPath(series, 600, 220)}
                      fill="url(#yapFill)"
                      className="transition-all duration-500"
                    />
                    <path
                      d={areaPath(series, 600, 220)}
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="3"
                      className="drop-shadow-[0_10px_30px_rgba(52,211,153,0.35)] transition-all duration-500"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span>Today is rendered locally until the Twitch firehose is connected.</span>
                    <div className="flex items-center gap-2 rounded-full bg-slate-800/60 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-200">
                      <BadgeInfo className="h-3 w-3 text-emerald-300" />
                      <span>Simulated</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="group relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4 shadow-xl shadow-emerald-900/30 backdrop-blur">
                <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl transition duration-500 group-hover:scale-110" />
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-200">
                  <Crown className="h-4 w-4" />
                  <span>Toadcoin Economy</span>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline gap-2 text-3xl font-black text-emerald-100">
                    {formatNumber(data?.toadcoin.totalMinted ?? 0)}
                    <span className="text-sm font-semibold text-emerald-200/80">Minted</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-2xl bg-emerald-400/10 p-3 text-emerald-100 shadow-inner shadow-emerald-900/40">
                      <p className="text-xs uppercase tracking-wide text-emerald-200/80">Circulating</p>
                      <p className="text-lg font-semibold">{formatNumber(data?.toadcoin.circulating ?? 0)}</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-400/10 p-3 text-emerald-100 shadow-inner shadow-emerald-900/40">
                      <p className="text-xs uppercase tracking-wide text-emerald-200/80">Vault</p>
                      <p className="text-lg font-semibold">{formatNumber(data?.toadcoin.vault ?? 0)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-emerald-100">
                    <RefreshCcw className="h-3.5 w-3.5 animate-spin opacity-80" />
                    <span>Ledger auto-persists in /data/chattergrounds.json</span>
                  </div>
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-3xl border border-indigo-500/25 bg-indigo-500/10 p-4 shadow-xl shadow-indigo-900/40 backdrop-blur">
                <div className="absolute right-2 top-2 h-24 w-24 rounded-full bg-indigo-400/20 blur-3xl transition duration-500 group-hover:scale-110" />
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-indigo-100">
                  <BarChart3 className="h-4 w-4" />
                  <span>Channel Pulse</span>
                </div>
                <div className="space-y-2 text-sm text-indigo-50/90">
                  <div className="flex items-center justify-between rounded-2xl bg-indigo-400/10 px-3 py-2 shadow-inner shadow-indigo-900/40">
                    <span>Chatters tracked</span>
                    <span className="font-semibold text-white">{formatNumber(data?.chatters.length ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-indigo-400/10 px-3 py-2 shadow-inner shadow-indigo-900/40">
                    <span>Quests completed</span>
                    <span className="font-semibold text-white">
                      {formatNumber(
                        (data?.chatters ?? []).reduce((sum, c) => sum + c.stats.questsCompleted, 0),
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-indigo-400/10 px-3 py-2 shadow-inner shadow-indigo-900/40">
                    <span>Messages logged</span>
                    <span className="font-semibold text-white">
                      {formatNumber((data?.chatters ?? []).reduce((sum, c) => sum + c.stats.messagesSent, 0))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950/60 shadow-2xl shadow-black/50">
              <div className="flex items-center justify-between border-b border-slate-800/60 bg-slate-900/70 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-200">
                  <MessageSquare className="h-4 w-4 text-emerald-300" />
                  <span>Chatter Roster</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Ghost className="h-4 w-4 text-slate-400" />
                  <span>Click a card to open profile</span>
                </div>
              </div>
              <div className="grid max-h-[520px] grid-cols-1 gap-3 overflow-y-auto p-4 pr-3 md:grid-cols-2">
                {(data?.chatters ?? []).map((chatter) => (
                  <button
                    key={chatter.id}
                    onClick={() => setSelectedChatter(chatter)}
                    className={clsx(
                      "group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/70 p-3 text-left shadow-lg shadow-black/30 transition-all duration-200 hover:-translate-y-[2px] hover:border-emerald-400/40 hover:shadow-emerald-500/20",
                      selectedChatter?.id === chatter.id && "ring-2 ring-emerald-400/60",
                    )}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-emerald-500/5 to-indigo-500/10 opacity-0 transition duration-200 group-hover:opacity-100" />
                    <div className="relative z-10 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{chatter.name}</p>
                        <p className="text-xs text-slate-300">Last: {chatter.lastMessage}</p>
                      </div>
                      <span
                        className={clsx(
                          "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide shadow-md transition",
                          flairStyles[chatter.flair] ?? "bg-slate-800 text-slate-100",
                        )}
                      >
                        {chatter.flair}
                      </span>
                    </div>
                    <div className="relative z-10 flex items-center gap-2 text-xs text-slate-300">
                      <span className="rounded-full bg-slate-800/70 px-2 py-1">
                        {formatNumber(chatter.stats.messagesSent)} msgs
                      </span>
                      <span className="rounded-full bg-slate-800/70 px-2 py-1">
                        {formatNumber(chatter.stats.timesBanned)} bans
                      </span>
                      <span className="rounded-full bg-slate-800/70 px-2 py-1">
                        {formatNumber(chatter.stats.toadcoins)} toadcoins
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Leaderboard
                title="Top Bans"
                icon={Trophy}
                accent="text-amber-300"
                items={banned.map((c) => ({ name: c.name, score: c.stats.timesBanned, flair: c.flair }))}
              />
              <Leaderboard
                title="Top Timeouts"
                icon={Medal}
                accent="text-indigo-300"
                items={timeouts.map((c) => ({ name: c.name, score: c.stats.timesTimedOut, flair: c.flair }))}
              />
              <Leaderboard
                title="Top Chatters"
                icon={Flame}
                accent="text-emerald-300"
                items={messages.map((c) => ({ name: c.name, score: c.stats.messagesSent, flair: c.flair }))}
              />
              <div className="group relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4 shadow-xl shadow-black/40">
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-200">
                  <ArrowUpRight className="h-4 w-4 text-emerald-300" />
                  <span>Profile Peek</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Click a chatter to open their profile and explore goofy stats. Everything is wired to persist locally so
                  you can keep minting toadcoins between sessions.
                </p>
              </div>
            </div>
          </div>
        </div>

        {loading && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 backdrop-blur">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/80 px-4 py-3 text-sm text-slate-200 shadow-xl shadow-black/40">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
              <span>Spooling up chatter intel…</span>
            </div>
          </div>
        )}
        {error && (
          <div className="fixed bottom-4 right-4 z-40 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100 shadow-lg shadow-red-900/50 backdrop-blur">
            {error}
          </div>
        )}
      </div>

      {selectedChatter && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm transition">
          <div className="relative w-full max-w-3xl translate-y-0 overflow-hidden rounded-t-3xl border border-slate-800/80 bg-slate-950/95 p-5 shadow-2xl shadow-black/60 transition-all duration-300 md:mb-8 md:rounded-3xl">
            <button
              onClick={() => setSelectedChatter(null)}
              className="absolute right-4 top-4 rounded-full bg-slate-800/70 px-3 py-1 text-xs font-semibold text-slate-200 shadow-inner shadow-black/40 transition hover:bg-slate-700/80"
            >
              Close
            </button>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/60 to-indigo-500/60 text-xl font-black text-white shadow-lg shadow-emerald-900/40">
                {selectedChatter.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <h2 className="text-2xl font-bold text-white">{selectedChatter.name}</h2>
                <p className="text-sm text-slate-300">Last message: {selectedChatter.lastMessage}</p>
              </div>
              <span
                className={clsx(
                  "ml-auto rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide shadow-md",
                  flairStyles[selectedChatter.flair] ?? "bg-slate-800 text-slate-100",
                )}
              >
                {selectedChatter.flair}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 rounded-2xl border border-slate-800/70 bg-slate-900/80 p-3 shadow-inner shadow-black/40">
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-200">
                  <Trophy className="h-4 w-4" />
                  <span>Core Stats</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-100">
                  <StatTile label="Total toadcoins" value={selectedChatter.stats.toadcoins} />
                  <StatTile label="Toadcoins minted" value={selectedChatter.stats.toadcoinsMinted} />
                  <StatTile label="Times banned" value={selectedChatter.stats.timesBanned} />
                  <StatTile label="Times timed out" value={selectedChatter.stats.timesTimedOut} />
                  <StatTile label="Quests completed" value={selectedChatter.stats.questsCompleted} />
                  <StatTile label="Messages sent" value={selectedChatter.stats.messagesSent} />
                </div>
              </div>

              <div className="space-y-2 rounded-2xl border border-slate-800/70 bg-slate-900/80 p-3 shadow-inner shadow-black/40">
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-indigo-200">
                  <Crown className="h-4 w-4" />
                  <span>Silly Signals</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-100">
                  <StatTile label="Estimated chatter age" value={selectedChatter.stats.estimatedAge} suffix=" yrs" />
                  <StatTile label="Months subbed" value={selectedChatter.stats.monthsSubbed} />
                  <StatTile label="Donos gifted" value={selectedChatter.stats.donosGifted} />
                  <StatTile label="Favourite word" value={selectedChatter.stats.favoriteWord} />
                  <StatTile label="Favourite emote" value={selectedChatter.stats.favoriteEmote} />
                  <StatTile label="Energy" value={Math.max(1, (selectedChatter.stats.messagesSent % 10) + 1) * 10} suffix="%" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-xl bg-slate-800/70 px-3 py-2 text-left shadow-inner shadow-black/30">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-lg font-semibold text-white">
        {typeof value === "number" ? formatNumber(value) : value}
        {suffix}
      </p>
    </div>
  );
}
