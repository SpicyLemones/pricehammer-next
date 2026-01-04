"use client";

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
  RefreshCw,
  Coins,
  Activity,
  SmilePlus,
  Heart,
  Gift,
  ShieldCheck,
  Zap,
  User,
  Star,
  Wind, // NEW
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
  isSubscriber: boolean; // NEW
  toadcoins: number; // Spendable currency from DB
  xp: number;        // Permanent progress from DB
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



const GRAPH_PADDING = { top: 30, right: 30, bottom: 50, left: 60 };
const VIEW_W = 800;
const VIEW_H = 350;
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

function getChatterIdentity(msgs: number, timeouts: number, bans: number) {
  if (msgs < 250) return "Unknown Entity";
  const tRatio = timeouts === 0 ? Infinity : msgs / timeouts;
  const bRatio = bans === 0 ? Infinity : msgs / bans;
  if (bans === 0 && timeouts === 0) return "Boring safe NPC";
  if (tRatio >= 500 && bRatio >= 50) return "Toadhead";
  if (tRatio >= 400 && bRatio >= 40) return "IJBOL farmer";
  if (tRatio >= 300 && bRatio >= 35) return "Javelin thrower";
  if (tRatio >= 200 && bRatio >= 30) return "Normie";
  if (tRatio >= 100 && bRatio >= 25) return "Chud";
  if (tRatio >= 50 && bRatio >= 10) return "Unfunny chuddy";
  return "Chaotic Element";
}

/**
 * REFACTORED: Now uses raw XP value from DB for leveling.
 */
function getLevelInfo(totalXp: number) {
  let level = 0;
  let currentThreshold = 500;
  let remainingXpInLevel = totalXp;
  while (remainingXpInLevel >= currentThreshold) {
    remainingXpInLevel -= currentThreshold;
    level++;
    currentThreshold = Math.floor(currentThreshold * 1.2);
  }
  return { 
    level, 
    progress: (remainingXpInLevel / currentThreshold) * 100, 
    currentThreshold, 
    remainingXp: Math.floor(remainingXpInLevel) 
  };
}

function SubscriberBadge({ isSubscriber }: { isSubscriber: boolean }) {
  return (
    <div className="relative group inline-flex items-center">
      {/* Main Badge Body */}
      <div
        className={clsx(
          "relative flex items-center justify-center rounded-md px-3 py-1 text-[10px] font-black italic tracking-tighter transition-all duration-300",
          isSubscriber
            ? "bg-emerald-500 text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.4)] group-hover:rotate-3 group-hover:scale-110"
            : "bg-slate-700 text-slate-400 group-hover:[animation:shiver_0.2s_infinite]"
        )}
      >
        <span className="flex items-center gap-1">
          {isSubscriber ? (
            <>
              <Star size={12} className="fill-slate-950 group-hover:animate-spin" />
              SUBSCRIBER (5% Bonus!)
            </>
          ) : (
            <>
              POOR
            </>
          )}
        </span>

        {/* Subscriber Hover: Sparkles */}
        {isSubscriber && (
          <Sparkles
            size={14}
            className="absolute -top-2 -right-2 text-amber-300 opacity-0 transition-all group-hover:opacity-100 group-hover:animate-bounce"
          />
        )}

        {/* Poor Hover: Stink/Sad Icons */}
        {!isSubscriber && (
          <div className="absolute -top-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
             <Wind size={10} className="text-green-700 animate-bounce" />
             <Wind size={10} className="text-green-800 animate-bounce [animation-delay:0.2s]" />
          </div>
        )}
      </div>

      {/* CSS for the Shiver Animation (Injecting into a style tag) */}
      <style>{`
        @keyframes shiver {
          0% { transform: translate(0, 0); }
          25% { transform: translate(-1px, 1px); }
          50% { transform: translate(1px, -1px); }
          75% { transform: translate(-1px, -1px); }
          100% { transform: translate(1px, 1px); }
        }
      `}</style>

      {/* Tooltip */}
      <div className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 opacity-0 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 z-50">
        <div className="rounded bg-slate-950 px-2 py-1 text-[9px] font-bold text-white border border-slate-800 whitespace-nowrap">
          {isSubscriber ? "Big Donor" : "Smells like broke"}
        </div>
      </div>
    </div>
  );
}


export default function ChattergroundsPage() {
  const [range, setRange] = useState<RangeKey>("today");
  const [selectedChatter, setSelectedChatter] = useState<ChatterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<ChattergroundsData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [showLevelUpAnim, setShowLevelUpAnim] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevLevelRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => { audioRef.current = new Audio("/audio/lvlup.mp3"); }, []);
  useEffect(() => { const t = setInterval(() => setNowTick(Date.now()), 10000); return () => clearInterval(t); }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setSelectedChatter(null);
      }
    }
    if (selectedChatter) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedChatter]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      if (!opts?.silent) setRefreshing(true);
      const res = await fetch("/api/twitch/chattergrounds", { cache: "no-store" });
      const json = await res.json();
      const rawData = json.data || json;
      const formatted: ChatterProfile[] = (rawData.chatters || []).map((c: any) => ({
        id: c.chatter_id || c.chatter_user_id || c.id,
        name: c.display_name || c.displayName || c.name || "Unknown",
        flair: (c.messages_sent ?? 0) > 100 ? "regular" : "new",
        lastMessage: c.last_message ?? c.lastMessage ?? null,
        stats: {
          timesBanned: c.times_banned ?? 0,
          timesTimedOut: c.times_timed_out ?? 0,
          questsCompleted: c.quests_completed ?? 0,
          messagesSent: c.messages_sent ?? 0,
          estimatedAge: c.estimated_age ?? 20,
          monthsSubbed: c.months_subbed ?? 0,
          donosGifted: c.donos_gifted ?? 0,
          isSubscriber: (c.is_subscriber ?? 0) === 1,
          toadcoins: c.toadcoins ?? 0,
          xp: c.xp ?? 0,
          favoriteWord: c.favorite_word ?? "Toad",
          favoriteEmote: c.favorite_emote ?? "Kappa",
        },
      }));
      setData({ updatedAt: rawData.updatedAt || new Date().toISOString(), origin: rawData.origin || "twitch", chatters: formatted, messageSeries: rawData.messageSeries || {} });
    } catch (e) { console.error(e); } finally { setRefreshing(false); setLoading(false); inFlightRef.current = false; }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!selectedChatter || !data) { prevLevelRef.current = null; return; }
    const currentData = data.chatters.find(c => c.id === selectedChatter.id);
    if (!currentData) return;

    const { level } = getLevelInfo(currentData.stats.xp);
    
    if (prevLevelRef.current !== null && level > prevLevelRef.current) { 
      audioRef.current?.play().catch(() => {});
      setShowLevelUpAnim(true);
      setTimeout(() => setShowLevelUpAnim(false), 3000);
    }
    prevLevelRef.current = level;
  }, [data, selectedChatter]);
  
  const levelDisplay = useMemo(() => {
    if (!selectedChatter || !data) return null;
    const currentData = data.chatters.find(c => c.id === selectedChatter.id) || selectedChatter;
    return getLevelInfo(currentData.stats.xp);
  }, [data, selectedChatter]);

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
    return (data?.chatters ?? [])
      .filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
      // Sort by XP descending (highest level first)
      .sort((a, b) => b.stats.xp - a.stats.xp);
  }, [data, searchTerm])

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-emerald-400"><Loader2 className="animate-spin" /></div>;

  return (
  <div className="relative min-h-screen bg-slate-950 text-slate-50 font-sans overflow-x-hidden">
    
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <video autoPlay muted loop playsInline className="h-full w-full object-cover blur-sm scale-110">
        <source src="/videos/chattergrounds.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-slate-950/60" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-transparent to-slate-950" />
    </div>

    <Link 
      href="/twitch" 
      className="fixed left-6 top-6 z-50 flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-5 py-2 text-xs font-bold text-slate-200 backdrop-blur-md hover:border-emerald-500/50 hover:text-emerald-400 transition-all shadow-lg active:scale-95"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      BACK TO SPYCY.FUN/TWITCH
    </Link>

    <div className="relative z-10 p-6 lg:p-10">
      <header className="mb-8 flex flex-wrap justify-between items-end gap-6 pt-16">
        <div>
          <h1 className="text-6xl font-black tracking-wider mb-2 drop-shadow-2xl">CHATTERGROUNDS</h1>
          <div className="flex items-center gap-3 text-slate-400 text-xs font-mono uppercase">
            <span className="flex items-center gap-1.5 bg-slate-900/50 px-2 py-1 rounded border border-slate-800">
              <Sparkles size={12} className="text-amber-400" /> 
              Updated {data ? formatTimeAgo(data.updatedAt, nowTick) : "just now"}
            </span>
            <button onClick={() => load()} className="inline-flex items-center gap-1.5 rounded border border-slate-800 bg-slate-900/50 px-2 py-1 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors">
              <RefreshCw size={12} className={clsx(refreshing && "animate-spin")} /> 
              {refreshing ? "refreshing" : "refresh"}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm">
            <div className="flex justify-between items-center mb-8">
              <h3 className="flex items-center gap-2 font-black text-slate-200 uppercase text-xl">
                <Flame className="text-orange-500" size={20} /> Yap Graph
              </h3>
              <div className="flex gap-1 bg-slate-950 p-1.5 rounded-full border border-slate-800">
                {(Object.keys(rangeLabels) as RangeKey[]).map((k) => (
                  <button key={k} onClick={() => setRange(k)} className={clsx("px-4 py-1.5 text-[10px] font-black rounded-full transition-all", range === k ? "bg-emerald-500 text-slate-950" : "text-slate-500 hover:text-slate-300")}>
                    {rangeLabels[k].toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="h-64 w-full relative">
              <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
                {[0, 0.5, 1].map((v) => (
                  <g key={v}>
                    <text x={GRAPH_PADDING.left - 15} y={GRAPH_PADDING.top + CHART_H * (1 - v) + 4} textAnchor="end" className="fill-slate-500 text-[10px] font-mono font-bold">{Math.round(maxMessages * v)}</text>
                    <line x1={GRAPH_PADDING.left} y1={GRAPH_PADDING.top + CHART_H * (1 - v)} x2={VIEW_W - GRAPH_PADDING.right} y2={GRAPH_PADDING.top + CHART_H * (1 - v)} stroke="#334155" strokeDasharray="4 4" opacity="0.5" />
                  </g>
                ))}
                <path d={linePath} fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
              </svg>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm">
            <h3 className="flex items-center gap-2 font-black text-slate-200 mb-8 uppercase text-xl">
              <BarChart3 className="text-indigo-400" size={20} /> Pulse
            </h3>
            <div className="space-y-4">
              <PulseBox label="Accumulated Chat" value={data?.chatters.reduce((s, c) => s + c.stats.messagesSent, 0) || 0} color="text-indigo-400" />
              <PulseBox label="Unique Chatters" value={data?.chatters.length || 0} color="text-emerald-400" />
              <PulseBox label="Completed Quests" value={data?.chatters.reduce((s, c) => s + c.stats.questsCompleted, 0) || 0} color="text-orange-400" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <VerticalBoard title="Top Chatters" icon={MessageSquare} items={leaderboards.chatters} stat="messagesSent" unit="msgs" onSelect={setSelectedChatter} />
          <VerticalBoard title="Ban Leaderboard" icon={Trophy} items={leaderboards.bans} stat="timesBanned" unit="bans" onSelect={setSelectedChatter} />
          <VerticalBoard title="Timeout Leaderboard" icon={Medal} items={leaderboards.timeouts} stat="timesTimedOut" unit="timeouts" onSelect={setSelectedChatter} />
        </div>

        <div className="bg-slate-900/60 border border-slate-800 p-10 rounded-[2.5rem] backdrop-blur-sm">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10">
            <h3 className="font-black text-2xl uppercase flex items-center gap-3">
              <Ghost size={24} className="text-slate-500" /> Global Roster
            </h3>
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input type="text" placeholder="Search user..." className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all" onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
            {filteredRoster.map((c) => {
            // Calculate level for the small card display
            const { level } = getLevelInfo(c.stats.xp);
            
            return (
              <button 
                key={c.id} 
                onClick={() => setSelectedChatter(c)} 
                className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl text-left hover:border-emerald-500 hover:bg-slate-900 transition-all active:scale-95 group"
              >
                <p className="text-sm font-black truncate uppercase group-hover:text-emerald-400">
                  {c.name}
                </p>
                <p className="text-[10px] text-emerald-500 font-mono font-bold uppercase">
                  LVL {level}
                </p>
              </button>
            );
          })}
          </div>
        </div>
      </div>
    </div>

    {/* MODAL: PROFILE INTELLIGENCE */}
    {selectedChatter && levelDisplay && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-6 overflow-y-auto animate-in fade-in duration-300">
        <div ref={modalRef} className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-[3rem] p-10 relative animate-in zoom-in-95 shadow-2xl my-auto">
          <div className="flex flex-col lg:flex-row justify-between items-start gap-8 mb-10">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-2">
                <h2 className="text-5xl lg:text-6xl font-black tracking-wider uppercase">{selectedChatter.name}</h2>
                <div className="relative group">
                  {showLevelUpAnim && (
                    <span className="absolute -top-12 left-1/2 -translate-x-1/2 text-amber-400 font-black italic text-2xl whitespace-nowrap animate-bounce pointer-events-none drop-shadow-[0_0_10px_rgba(251,191,36,0.8)]">LEVEL UP!</span>
                  )}
                  <div className="flex items-center gap-3">
  {/* Level Badge */}
  <div className="bg-emerald-500 text-slate-950 px-3 py-1 rounded-md text-xl font-black italic shadow-[0_0_15px_rgba(16,185,129,0.5)]">
    LVL {levelDisplay.level}
  </div>

  {/* The new Subscriber/Poor Badge */}
  <SubscriberBadge isSubscriber={selectedChatter.stats.isSubscriber} />
</div>

                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-500" />
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Chatter Identity:</span>
                  <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                    {getChatterIdentity(selectedChatter.stats.messagesSent, selectedChatter.stats.timesTimedOut, selectedChatter.stats.timesBanned)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <User size={16} className="text-slate-600" />
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">EST. AGE: {selectedChatter.stats.estimatedAge}</span>
                </div>
              </div>
            </div>
            
            <div className="w-full lg:w-72 bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div className="flex justify-between items-end mb-2">
                <span className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1">
                  <Zap size={10} className="text-amber-400 fill-amber-400" /> XP Progress
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  {formatNumber(levelDisplay.remainingXp)} / {formatNumber(levelDisplay.currentThreshold)}
                </span>
              </div>
              <div className="h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800 relative">
                <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000 ease-out relative shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ width: `${levelDisplay.progress}%` }}>
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatTile label="Messages" val={selectedChatter.stats.messagesSent} color="text-emerald-400" />
            <StatTile label="Bans" val={selectedChatter.stats.timesBanned} color="text-red-400" />
            <StatTile label="Timeouts" val={selectedChatter.stats.timesTimedOut} color="text-orange-400" />
            <StatTile icon={Coins} label="Toadcoins" val={selectedChatter.stats.toadcoins} suffix=" TC" color="text-amber-400" />
            <StatTile icon={Heart} label="Months Subbed" val={selectedChatter.stats.monthsSubbed} color="text-indigo-400" />
            <StatTile icon={Gift} label="Donos Gifted" val={selectedChatter.stats.donosGifted} color="text-pink-400" />
            <StatTile icon={Activity} label="Fav Activity" val={selectedChatter.stats.favoriteWord} color="text-slate-200" expandable />
            <StatTile icon={SmilePlus} label="Fav Emote" val={selectedChatter.stats.favoriteEmote} color="text-slate-200" />
          </div>

          <div className="p-8 bg-slate-950 rounded-[2rem] border border-slate-800 shadow-inner relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent h-1" />
            <p className="text-[10px] text-slate-500 uppercase font-black mb-4 tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Intercepted Transmission
            </p>
            <p className="text-2xl font-medium italic text-slate-300 leading-relaxed">
              "{selectedChatter.lastMessage || "Target has remained silent..."}"
            </p>
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
          <button key={item.id} onClick={() => onSelect(item)} className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-950/50 border border-slate-800/50 hover:bg-slate-900 hover:border-emerald-500/50 transition-all group active:scale-95">
            <div className="flex items-center gap-4"><span className="text-xs font-mono font-black text-slate-600 group-hover:text-emerald-400">#{i + 1}</span><span className="font-black uppercase text-sm text-slate-200">{item.name}</span></div>
            <div className="text-right"><span className="font-mono font-black text-emerald-400">{item.stats[stat].toLocaleString()}</span><span className="text-[9px] text-slate-600 font-bold ml-1 uppercase">{unit}</span></div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PulseBox({ label, value, color }: any) {
  return (
    <div className="bg-slate-950 p-5 rounded-3xl border border-slate-800/50 shadow-inner"><p className="text-[10px] uppercase font-black text-slate-600 mb-1 tracking-widest">{label}</p><p className={clsx("text-3xl font-black font-mono", color)}>{value.toLocaleString()}</p></div>
  );
}

function StatTile({ label, val, suffix = "", color = "text-white", icon: Icon, expandable = false }: any) {
  return (
    <div className="group relative bg-slate-950 p-4 rounded-2xl border border-slate-800 shadow-inner overflow-hidden transition-all hover:border-slate-700">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon size={12} className="text-slate-500" />}
        <p className="text-[9px] uppercase font-black text-slate-500 tracking-tighter">{label}</p>
      </div>
      <p className={clsx("text-lg font-black font-mono truncate", color)}>
        {val}{suffix}
      </p>
      {expandable && (
        <div className="absolute inset-0 bg-slate-950/95 p-4 flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <p className={clsx("text-sm font-black uppercase leading-tight", color)}>
            {val}{suffix}
          </p>
        </div>
      )}
    </div>
  );
}