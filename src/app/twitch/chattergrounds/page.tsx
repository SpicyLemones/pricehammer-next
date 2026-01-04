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
  Coins,
  Languages,
  SmilePlus
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
  origin: string;
  chatters: ChatterProfile[];
  messageSeries: Record<RangeKey, MessagePoint[]>;
};

const POLL_MS = 5000;
const rangeLabels: Record<RangeKey, string> = {
  today: "Today",
  week: "7 Days",
  month: "1 Month",
  all: "All",
};

// Graph Layout Constants
const GRAPH_PADDING = { top: 20, right: 20, bottom: 40, left: 50 };
const VIEW_W = 700;
const VIEW_H = 300;
const CHART_W = VIEW_W - GRAPH_PADDING.left - GRAPH_PADDING.right;
const CHART_H = VIEW_H - GRAPH_PADDING.top - GRAPH_PADDING.bottom;

const formatNumber = (num: number) => (Number.isFinite(num) ? num.toLocaleString() : "0");

function formatTimeAgo(iso: string, nowMs: number) {
  const delta = Math.max(0, nowMs - new Date(iso).getTime());
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
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

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      if (!opts?.silent) setRefreshing(true);
      const res = await fetch("/api/twitch/chattergrounds", { cache: "no-store" });
      const json = await res.json();
      const rawData = json.data || json;
      const rawChatters = rawData.chatters || [];

      const formatted: ChatterProfile[] = rawChatters.map((c: any) => ({
        id: c.chatter_id || c.chatter_user_id || c.id,
        name: c.display_name || c.displayName || c.name || "Unknown",
        flair: (c.messages_sent ?? 0) > 100 ? "regular" : "new",
        lastMessage: c.last_message ?? c.lastMessage ?? null,
        stats: {
          timesBanned: c.times_banned ?? c.timesBanned ?? 0,
          timesTimedOut: c.times_timed_out ?? c.timesTimedOut ?? 0,
          questsCompleted: c.quests_completed ?? c.questsCompleted ?? 0,
          messagesSent: c.messages_sent ?? c.messagesSent ?? 0,
          estimatedAge: c.estimated_age ?? c.estimatedAge ?? 20,
          monthsSubbed: c.months_subbed ?? c.monthsSubbed ?? 0,
          donosGifted: c.donos_gifted ?? c.donosGifted ?? 0,
          // Using the traits provided by your API
          favoriteWord: c.favorite_word ?? c.favoriteWord ?? "Toad",
          favoriteEmote: c.favorite_emote ?? c.favoriteEmote ?? "Kappa",
        },
      }));

      setData({
        updatedAt: rawData.updatedAt || new Date().toISOString(),
        origin: rawData.origin || "twitch",
        chatters: formatted,
        messageSeries: rawData.messageSeries || {},
      });
    } catch (e) {
      console.error("Load Error:", e);
    } finally {
      setRefreshing(false);
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Graph Logic
  const series = useMemo(() => data?.messageSeries?.[range] ?? [], [data, range]);
  const maxMessages = useMemo(() => Math.max(...series.map((p) => p.messages), 1), [series]);
  
  const linePath = useMemo(() => {
    if (series.length < 2) return "";
    const stepX = CHART_W / (series.length - 1);
    return series.map((p, i) => {
      const x = GRAPH_PADDING.left + i * stepX;
      const y = GRAPH_PADDING.top + (CHART_H - (p.messages / maxMessages) * CHART_H);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(" ");
  }, [series, maxMessages]);

  const leaderboards = useMemo(() => {
    const base = [...(data?.chatters ?? [])];
    return {
      chatters: [...base].sort((a, b) => b.stats.messagesSent - a.stats.messagesSent).slice(0, 5),
      bans: [...base].sort((a, b) => b.stats.timesBanned - a.stats.timesBanned).slice(0, 5),
      timeouts: [...base].sort((a, b) => b.stats.timesTimedOut - a.stats.timesTimedOut).slice(0, 5),
    };
  }, [data]);

  const filteredRoster = useMemo(() => {
    return (data?.chatters ?? []).filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [data, searchTerm]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-emerald-400"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6 lg:p-10 font-sans">
      <header className="mb-8 flex flex-wrap justify-between items-end gap-6 pt-16">
        <div>
          <h1 className="text-6xl font-black tracking-tight mb-2">CHATTERGROUNDS</h1>
          <div className="flex items-center gap-3 text-slate-500 text-xs font-mono uppercase">
            <span className="flex items-center gap-1.5"><Sparkles size={12} className="text-amber-400" /> Updated {data ? formatTimeAgo(data.updatedAt, nowTick) : "just now"}</span>
            <button onClick={() => load()} className="inline-flex items-center gap-1.5 rounded border border-slate-800 px-2 py-0.5 hover:text-emerald-400">
              <RefreshCw size={12} className={clsx(refreshing && "animate-spin")} /> {refreshing ? "refreshing" : "refresh"}
            </button>
          </div>
        </div>
        <Link href="/twitch" className="fixed left-6 top-6 z-50 flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-5 py-2 text-xs font-bold text-slate-200 backdrop-blur-md">
          ← BACK TO TOYBOX
        </Link>
      </header>

      <div className="flex flex-col gap-6">
        {/* ROW 1: GRAPH & PULSE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem]">
            <div className="flex justify-between items-center mb-8">
              <h3 className="flex items-center gap-2 font-black text-slate-200 uppercase text-xl"><Flame className="text-orange-500" size={20} /> Yap Graph</h3>
              <div className="flex gap-1 bg-slate-950 p-1.5 rounded-full border border-slate-800">
                {(Object.keys(rangeLabels) as RangeKey[]).map((k) => (
                  <button key={k} onClick={() => setRange(k)} className={clsx("px-4 py-1.5 text-[10px] font-black rounded-full", range === k ? "bg-emerald-500 text-slate-950" : "text-slate-500")}>
                    {rangeLabels[k].toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-64 w-full relative">
              <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
                {/* Y-Axis labels */}
                {[0, 0.5, 1].map((v) => (
                  <text key={v} x={GRAPH_PADDING.left - 10} y={GRAPH_PADDING.top + CHART_H * (1 - v) + 4} textAnchor="end" className="fill-slate-600 text-[10px] font-mono font-bold">
                    {Math.round(maxMessages * v)}
                  </text>
                ))}
                {/* X-Axis labels (First and Last timestamp) */}
                {series.length > 0 && (
                  <>
                    <text x={GRAPH_PADDING.left} y={VIEW_H - 10} textAnchor="start" className="fill-slate-600 text-[10px] font-mono font-bold uppercase">{new Date(series[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>
                    <text x={VIEW_W - GRAPH_PADDING.right} y={VIEW_H - 10} textAnchor="end" className="fill-slate-600 text-[10px] font-mono font-bold uppercase">{new Date(series[series.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>
                  </>
                )}
                <path d={linePath} fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem]">
            <h3 className="flex items-center gap-2 font-black text-slate-200 mb-8 uppercase text-xl"><BarChart3 className="text-indigo-400" size={20} /> Pulse</h3>
            <div className="space-y-4">
              <PulseBox label="Accumulated Chat" value={data?.chatters.reduce((s, c) => s + c.stats.messagesSent, 0) || 0} color="text-indigo-400" />
              <PulseBox label="Unique Chatters" value={data?.chatters.length || 0} color="text-emerald-400" />
              <PulseBox label="Completed Quests" value={data?.chatters.reduce((s, c) => s + c.stats.questsCompleted, 0) || 0} color="text-orange-400" />
            </div>
          </div>
        </div>

        {/* ROW 2: VERTICAL LEADERBOARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <VerticalBoard title="Top Chatters" icon={MessageSquare} items={leaderboards.chatters} stat="messagesSent" unit="msgs" onSelect={setSelectedChatter} />
          <VerticalBoard title="Ban Leaderboard" icon={Trophy} items={leaderboards.bans} stat="timesBanned" unit="bans" onSelect={setSelectedChatter} />
          <VerticalBoard title="Timeout Leaderboard" icon={Medal} items={leaderboards.timeouts} stat="timesTimedOut" unit="timeouts" onSelect={setSelectedChatter} />
        </div>

        {/* ROSTER */}
        <div className="bg-slate-900/40 border border-slate-800 p-10 rounded-[2.5rem]">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10">
            <h3 className="font-black text-2xl uppercase flex items-center gap-3"><Ghost size={24} className="text-slate-600" /> Global Roster</h3>
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input type="text" placeholder="Search user..." className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm" onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
            {filteredRoster.map((c) => (
              <button key={c.id} onClick={() => setSelectedChatter(c)} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-left hover:border-emerald-500 transition-all">
                <p className="text-sm font-black truncate uppercase">{c.name}</p>
                <p className="text-[10px] text-slate-600 font-mono font-bold">{formatNumber(c.stats.messagesSent)} MSGS</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* PROFILE POPUP */}
      {selectedChatter && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-6">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-[3rem] p-10 relative animate-in zoom-in-95">
            <button onClick={() => setSelectedChatter(null)} className="absolute top-8 right-8 text-slate-500 hover:text-white font-bold text-xs bg-slate-950 px-4 py-2 rounded-full border border-slate-800">CLOSE</button>
            <div className="mb-8">
              <h2 className="text-5xl font-black mb-2 tracking-tighter uppercase">{selectedChatter.name}</h2>
              <p className="text-emerald-500 text-xs font-black uppercase tracking-widest">Profile Intelligence Result</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
              <StatTile label="Total Messages" val={selectedChatter.stats.messagesSent} />
              <StatTile label="Total Bans" val={selectedChatter.stats.timesBanned} />
              <StatTile label="Total Timeouts" val={selectedChatter.stats.timesTimedOut} />
              <StatTile icon={Coins} label="Net Worth" val={selectedChatter.stats.messagesSent * 5} suffix=" TC" color="text-amber-400" />
              <StatTile icon={Languages} label="Favourite Word" val={selectedChatter.stats.favoriteWord} color="text-indigo-400" />
              <StatTile icon={SmilePlus} label="Favourite Emote" val={selectedChatter.stats.favoriteEmote} color="text-pink-400" />
            </div>
            <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 shadow-inner">
              <p className="text-[10px] text-slate-500 uppercase font-black mb-3">Intercepted Transmission</p>
              <p className="text-lg font-medium italic text-slate-300">"{selectedChatter.lastMessage || "Target has remained silent..."}"</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VerticalBoard({ title, icon: Icon, items, stat, unit, onSelect }: any) {
  return (
    <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-[2.5rem]">
      <h3 className="flex items-center gap-2 font-black text-slate-500 text-xs uppercase tracking-widest mb-6 px-2"><Icon size={16} /> {title}</h3>
      <div className="space-y-2">
        {items.map((item: any, i: number) => (
          <button key={item.id} onClick={() => onSelect(item)} className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-950/50 border border-slate-800/50 hover:bg-slate-900 hover:border-emerald-500/50 transition-all group">
            <div className="flex items-center gap-4">
              <span className="text-xs font-mono font-black text-slate-600 group-hover:text-emerald-400">#{i + 1}</span>
              <span className="font-black uppercase text-sm text-slate-200">{item.name}</span>
            </div>
            <div className="text-right">
              <span className="font-mono font-black text-emerald-400">{item.stats[stat].toLocaleString()}</span>
              <span className="text-[9px] text-slate-600 font-bold ml-1 uppercase">{unit}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PulseBox({ label, value, color }: any) {
  return (
    <div className="bg-slate-950 p-5 rounded-3xl border border-slate-800/50">
      <p className="text-[10px] uppercase font-black text-slate-600 mb-1">{label}</p>
      <p className={clsx("text-3xl font-black font-mono", color)}>{value.toLocaleString()}</p>
    </div>
  );
}

function StatTile({ label, val, suffix = "", color = "text-white", icon: Icon }: any) {
  return (
    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon size={12} className="text-slate-500" />}
        <p className="text-[9px] uppercase font-black text-slate-500">{label}</p>
      </div>
      <p className={clsx("text-lg font-black font-mono truncate", color)}>{val}{suffix}</p>
    </div>
  );
}