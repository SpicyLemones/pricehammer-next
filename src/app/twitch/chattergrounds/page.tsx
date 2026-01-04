"use client";

import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Flame,
  Ghost,
  Loader2,
  Medal,
  MessageSquare,
  Search,
  Trophy,
  Sparkles,
  BadgeInfo,
  RefreshCw,
} from "lucide-react";
import clsx from "clsx";

type RangeKey = "today" | "week" | "month" | "all";

type MessagePoint = {
  timestamp: string;
  messages: number;
};

type ChatterProfile = {
  id: string;
  name: string;
  flair: string;
  lastMessage: string | null;
  stats: {
    timesBanned: number;
    timesTimedOut: number;
    questsCompleted: number;
    messagesSent: number;
    estimatedAge: number;
    monthsSubbed: number;
    donosGifted: number;
    favoriteWord: string | null;
    favoriteEmote: string | null;
  };
};

type ChattergroundsData = {
  updatedAt: string;
  origin: "twitch" | "offline" | "seed" | "fallback";
  chatters: ChatterProfile[];
  messageSeries: Record<RangeKey, MessagePoint[]>;
  owner?: { userId?: string; login?: string; displayName?: string };
};

const POLL_MS = 5000;

const rangeLabels: Record<RangeKey, string> = {
  today: "Today",
  week: "7 Days",
  month: "1 Month",
  all: "All",
};

const formatNumber = (num: number) => (Number.isFinite(num) ? num.toLocaleString() : "0");

function formatTimeAgo(iso: string, nowMs: number) {
  const delta = Math.max(0, nowMs - new Date(iso).getTime());
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Top-line (stroke) path
function linePath(points: MessagePoint[], width: number, height: number) {
  if (!points || points.length < 2) return "";
  const maxMessages = Math.max(...points.map((p) => p.messages), 1);
  const stepX = width / (points.length - 1);
  const coords = points.map((p, idx) => [idx * stepX, height - (p.messages / maxMessages) * height]);

  let d = `M ${coords[0][0]} ${coords[0][1]}`;
  for (let i = 1; i < coords.length; i++) {
    const [x, y] = coords[i];
    const [px, py] = coords[i - 1];
    const cx = (px + x) / 2;
    d += ` C ${cx} ${py} ${cx} ${y} ${x} ${y}`;
  }
  return d;
}

// Area (fill) path
function areaPath(points: MessagePoint[], width: number, height: number) {
  const lp = linePath(points, width, height);
  if (!lp) return "";
  return `${lp} L ${width} ${height} L 0 ${height} Z`;
}

function looksLikeNumericId(value: unknown) {
  return typeof value === "string" && /^\d+$/.test(value);
}

function resolveChatterName(c: any) {
  const candidate =
    c.chatter_user_login ??
    c.user_login ??
    c.chatter_login ??
    c.login ??
    c.displayName ??
    c.display_name ??
    c.chatter_user_name ??
    c.name;

  if (!candidate) return "Unknown";

  if (looksLikeNumericId(candidate)) {
    const fallback =
      c.chatter_user_login ??
      c.user_login ??
      c.chatter_login ??
      c.login ??
      c.chatter_user_name;

    if (fallback) return String(fallback);
    return `user_${String(candidate).slice(-4)}`;
  }

  return String(candidate);
}

function zeroSeries(): MessagePoint[] {
  const t2 = new Date().toISOString();
  const t1 = new Date(Date.now() - POLL_MS).toISOString();
  return [
    { timestamp: t1, messages: 0 },
    { timestamp: t2, messages: 0 },
  ];
}

export default function ChattergroundsPage() {
  const [range, setRange] = useState<RangeKey>("today");
  const [selectedChatter, setSelectedChatter] = useState<ChatterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<ChattergroundsData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());

  const inFlightRef = useRef(false);

  // ticks the "Updated Xm ago" without needing new data
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const silent = Boolean(opts?.silent);

    try {
      if (!silent) setRefreshing(true);

      const res = await fetch("/api/twitch/chattergrounds", { cache: "no-store" });
      const json = await res.json();

      const rawData = json.data || json;
      const rawChatters = rawData.chatters || [];

      const formatted: ChatterProfile[] = rawChatters.map((c: any) => {
        const messagesSent = c.messages_sent ?? c.messagesSent ?? 0;
        return {
          id: c.chatter_id || c.chatter_user_id || c.id,
          name: resolveChatterName(c),
          flair: messagesSent > 100 ? "regular" : "new",
          lastMessage: c.last_message ?? c.lastMessage ?? null,
          stats: {
            timesBanned: c.times_banned ?? c.timesBanned ?? 0,
            timesTimedOut: c.times_timed_out ?? c.timesTimedOut ?? 0,
            questsCompleted: c.quests_completed ?? c.questsCompleted ?? 0,
            messagesSent,
            estimatedAge: c.estimated_age ?? c.estimatedAge ?? 20,
            monthsSubbed: c.months_subbed ?? c.monthsSubbed ?? 0,
            donosGifted: c.donos_gifted ?? c.donosGifted ?? 0,
            favoriteWord: c.favorite_word ?? c.favoriteWord ?? null,
            favoriteEmote: c.favorite_emote ?? c.favoriteEmote ?? null,
          },
        };
      });

      const nowIso = new Date().toISOString();

      setData((prev) => {
        const serverSeries = rawData.messageSeries as Partial<Record<RangeKey, MessagePoint[]>> | undefined;

        const pick = (k: RangeKey): MessagePoint[] => {
          const arr = serverSeries?.[k];
          if (Array.isArray(arr) && arr.length >= 2) return arr;

          const prevArr = prev?.messageSeries?.[k];
          if (Array.isArray(prevArr) && prevArr.length >= 2) return prevArr;

          return zeroSeries();
        };

        return {
          origin: rawData.origin || (formatted.length > 0 ? "twitch" : "offline"),
          updatedAt: rawData.updatedAt || nowIso,
          chatters: formatted,
          messageSeries: {
            today: pick("today"),
            week: pick("week"),
            month: pick("month"),
            all: pick("all"),
          },
          owner: rawData.owner || json.owner,
        };
      });
    } catch (e) {
      console.error("Chattergrounds Load Error:", e);
    } finally {
      if (!silent) setRefreshing(false);
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  // initial load + polling
  useEffect(() => {
    load();
    const id = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // refresh immediately when you tab back in
  useEffect(() => {
    const onFocus = () => load({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const series = useMemo(() => data?.messageSeries?.[range] ?? [], [data, range]);

  const isTwitchScoped = useMemo(() => {
    if (!data) return false;
    return data.origin === "twitch" || Boolean(data.owner?.userId || data.owner?.login || data.chatters.length > 0);
  }, [data]);

  const leaderboards = useMemo(() => {
    const base = [...(data?.chatters ?? [])];
    return {
      chatters: [...base].sort((a, b) => b.stats.messagesSent - a.stats.messagesSent).slice(0, 10),
      bans: [...base].sort((a, b) => b.stats.timesBanned - a.stats.timesBanned).slice(0, 10),
      timeouts: [...base].sort((a, b) => b.stats.timesTimedOut - a.stats.timesTimedOut).slice(0, 10),
    };
  }, [data]);

  const filteredRoster = useMemo(() => {
    return (data?.chatters ?? []).filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [data, searchTerm]);

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-emerald-400">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6 lg:p-10 font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* HEADER */}
      <header className="mb-8 flex flex-wrap justify-between items-end gap-6 pt-16">
        <div>
          <h1 className="text-6xl font-black tracking-tight mb-2">CHATTERGROUNDS</h1>

          <div className="flex items-center gap-3 text-slate-500 text-xs font-mono uppercase">
            <span className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-amber-400" />
              Updated {data ? formatTimeAgo(data.updatedAt, nowTick) : "just now"}
            </span>

            {/* refresh button */}
            <button
              onClick={() => load()}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 transition-colors",
                "border-slate-800 hover:border-emerald-500/50 hover:text-emerald-400",
                refreshing && "opacity-70"
              )}
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw size={12} className={clsx(refreshing && "animate-spin")} />
              {refreshing ? "refreshing" : "refresh"}
            </button>

            <span
              className={clsx(
                "px-2 py-0.5 rounded border transition-colors",
                isTwitchScoped ? "border-emerald-500/50 text-emerald-400" : "border-slate-800 text-slate-500"
              )}
            >
              Status: {isTwitchScoped ? "Live Sync" : "Offline Mode"}
            </span>
          </div>
        </div>

        <Link
          href="/twitch"
          className="fixed left-6 top-6 z-50 flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-5 py-2 text-xs font-bold text-slate-200 shadow-xl backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-emerald-500/50 hover:bg-slate-800 hover:text-emerald-400"
        >
          <span className="text-lg">←</span> BACK TO TOYBOX
        </Link>
      </header>

      {/* AUTH BANNER */}
      {!isTwitchScoped && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-amber-500/30 bg-amber-500/5 px-6 py-4 backdrop-blur-sm animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3">
            <BadgeInfo className="text-amber-400" size={20} />
            <p className="text-sm text-amber-100/90">
              <span className="font-bold uppercase tracking-wider text-[10px] bg-amber-500/20 px-2 py-0.5 rounded mr-2">
                Authorization Required
              </span>
              Connect Twitch to sync your actual chat data and unlock full tracking.
            </p>
          </div>
          <a
            href="/api/twitch/login?redirect=%2Ftwitch%2Fchattergrounds"
            className="rounded-full bg-amber-400 px-5 py-2 text-xs font-black text-slate-950 hover:bg-amber-300 transition uppercase tracking-wider shadow-lg shadow-amber-500/10"
          >
            Authorize Twitch
          </a>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {/* ROW 1: GRAPH & PULSE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem]">
            <div className="flex justify-between items-center mb-8">
              <h3 className="flex items-center gap-2 font-black text-slate-200 uppercase tracking-tight text-xl">
                <Flame className="text-orange-500" size={20} /> Yap Graph
              </h3>
              <div className="flex gap-1 bg-slate-950 p-1.5 rounded-full border border-slate-800 shadow-inner">
                {(Object.keys(rangeLabels) as RangeKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setRange(k)}
                    className={clsx(
                      "px-4 py-1.5 text-[10px] font-black rounded-full transition-all",
                      range === k
                        ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"
                        : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {rangeLabels[k].toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-64 w-full relative group">
              <svg className="w-full h-full" viewBox="0 0 600 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                  </linearGradient>
                </defs>

                <path d={areaPath(series, 600, 200)} fill="url(#g)" className="transition-all duration-700 ease-in-out" />
                <path
                  d={linePath(series, 600, 200)}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="4"
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-in-out"
                />
              </svg>

              {series.length < 2 && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-700 font-mono text-xs uppercase tracking-widest">
                  Awaiting Pulse Data...
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem]">
            <h3 className="flex items-center gap-2 font-black text-slate-200 mb-8 uppercase tracking-tight text-xl">
              <BarChart3 className="text-indigo-400" size={20} /> Pulse
            </h3>
            <div className="space-y-4">
              <PulseBox
                label="Messages Logged"
                value={data?.chatters.reduce((s, c) => s + c.stats.messagesSent, 0) || 0}
                color="text-indigo-400"
              />
              <PulseBox label="Unique Chatters" value={data?.chatters.length || 0} color="text-emerald-400" />
              <PulseBox
                label="Active Quests"
                value={data?.chatters.reduce((s, c) => s + c.stats.questsCompleted, 0) || 0}
                color="text-orange-400"
              />
            </div>
          </div>
        </div>

        {/* FULL WIDTH LEADERBOARDS */}
        <WideBoard
          title="Top Chatters"
          icon={MessageSquare}
          items={leaderboards.chatters}
          stat="messagesSent"
          unit="msgs"
          color="border-emerald-500/10"
        />
        <WideBoard title="Ban Leaderboard" icon={Trophy} items={leaderboards.bans} stat="timesBanned" unit="bans" color="border-red-500/10" />
        <WideBoard
          title="Timeout Leaderboard"
          icon={Medal}
          items={leaderboards.timeouts}
          stat="timesTimedOut"
          unit="timeouts"
          color="border-amber-500/10"
        />

        {/* ROSTER */}
        <div className="bg-slate-900/40 border border-slate-800 p-10 rounded-[2.5rem]">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10">
            <h3 className="font-black text-2xl uppercase tracking-tighter flex items-center gap-3">
              <Ghost size={24} className="text-slate-600" /> Global Roster
            </h3>
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="text"
                placeholder="Search user profile..."
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
            {filteredRoster.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedChatter(c)}
                className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl text-left hover:border-emerald-500/50 hover:bg-slate-900 transition-all group active:scale-95"
              >
                <p className="text-sm font-black truncate group-hover:text-emerald-400 uppercase tracking-tight">{c.name}</p>
                <p className="text-[10px] text-slate-600 font-mono mt-1 font-bold">{formatNumber(c.stats.messagesSent)} MSGS</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* POPUP */}
      {selectedChatter && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-6">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-[3rem] p-10 relative shadow-2xl animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedChatter(null)}
              className="absolute top-8 right-8 text-slate-500 hover:text-white font-bold text-xs tracking-widest bg-slate-950 px-4 py-2 rounded-full border border-slate-800"
            >
              CLOSE
            </button>

            <div className="mb-8">
              <h2 className="text-5xl font-black mb-2 tracking-tighter uppercase">{selectedChatter.name}</h2>
              <p className="text-emerald-500 text-xs font-black uppercase tracking-[0.3em]">Profile Intelligence Result</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
              <StatTile label="Total Messages" val={selectedChatter.stats.messagesSent} />
              <StatTile label="Total Bans" val={selectedChatter.stats.timesBanned} />
              <StatTile label="Total Timeouts" val={selectedChatter.stats.timesTimedOut} />
              <StatTile label="Quests Done" val={selectedChatter.stats.questsCompleted} />
              <StatTile label="Estimated Age" val={selectedChatter.stats.estimatedAge} suffix="yr" />
              <StatTile label="Subs" val={selectedChatter.stats.monthsSubbed} suffix="mo" />
            </div>

            <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 shadow-inner">
              <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-3">Intercepted Transmission</p>
              <p className="text-lg font-medium italic text-slate-300 leading-relaxed">
                &quot;{selectedChatter.lastMessage || "Target has remained silent..."}&quot;
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PulseBox({ label, value, color }: any) {
  return (
    <div className="bg-slate-950 p-5 rounded-3xl border border-slate-800/50 shadow-inner">
      <p className="text-[10px] uppercase font-black text-slate-600 mb-1 tracking-widest">{label}</p>
      <p className={clsx("text-3xl font-black font-mono", color)}>{value.toLocaleString()}</p>
    </div>
  );
}

function WideBoard({ title, icon: Icon, items, stat, unit, color }: any) {
  return (
    <div className={clsx("bg-slate-900/40 border p-8 rounded-[2.5rem]", color)}>
      <h3 className="flex items-center gap-2 font-black text-slate-500 text-xs uppercase tracking-[0.2em] mb-8">
        <Icon size={16} /> {title}
      </h3>
      <div className="flex gap-4 overflow-x-auto pb-4 scroll-smooth custom-scrollbar">
        {items.map((item: any, i: number) => (
          <div
            key={item.id}
            className="min-w-[200px] bg-slate-950 p-5 rounded-[2rem] border border-slate-800 relative group hover:border-slate-600 transition-all"
          >
            <span className="absolute -top-2 -left-2 w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-xs font-black border-2 border-slate-900 text-slate-400 group-hover:text-emerald-400 transition-colors">
              {i + 1}
            </span>
            <p className="font-black text-base truncate mb-1 uppercase tracking-tight">{item.name}</p>
            <p className="text-emerald-400 font-mono text-sm font-black">
              {item.stats[stat].toLocaleString()}{" "}
              <span className="text-slate-600 text-[10px] font-sans">{unit.toUpperCase()}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatTile({ label, val, suffix = "" }: any) {
  return (
    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors shadow-inner">
      <p className="text-[9px] uppercase font-black text-slate-500 tracking-tighter mb-1">{label}</p>
      <p className="text-xl font-black font-mono">
        {val}
        {suffix}
      </p>
    </div>
  );
}
