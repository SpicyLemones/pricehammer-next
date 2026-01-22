"use client";
import Image from "next/image";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BadgeCheck,
  Ban,
  Clock3,
  Coins,
  Crown,
  Ghost,
  Laugh,
  Loader2,
  Lock,
  Music2,
  Puzzle,
  Sparkles,
  Timer,
  MessageCircle,
  Gamepad2,
  Heart,
  BrainCircuit,
} from "lucide-react";

import clsx from "clsx";

type QuestCategory =
  | "prime"
  | "ban"
  | "timeout"
  | "stream-time"
  | "insult"
  | "wordle"
  | "bandle"
  | "chat"
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

type QuestResponse = {
  regenerated?: boolean;
  date: string;
  generatedAt: string;
  quests: StreamQuest[];
  
  // -- New Fields from Server --
  dailyQuestor: string;
  chatterQuests: ChatterQuest[];
  chatterRerollUsed: boolean;
  
  ledger: Record<string, number>;
  audience: AudienceSnapshot;
};

const categoryMeta: Record<
  string, // loosely typed to allow new categories without breaking
  {
    label: string;
    icon: ComponentType<{ className?: string }>;
    iconTint: string;
    chip: string;
  }
> = {
  prime: {
    label: "Subs",
    icon: Crown,
    iconTint: "text-amber-200",
    chip: "border-[#c48652]/70 bg-[#2c3c53] text-amber-100",
  },
  ban: {
    label: "Ban",
    icon: Ban,
    iconTint: "text-amber-200",
    chip: "border-[#c48652]/70 bg-[#453245] text-amber-100",
  },
  timeout: {
    label: "Timeout",
    icon: Timer,
    iconTint: "text-amber-200",
    chip: "border-[#c48652]/70 bg-[#2c3c53] text-amber-100",
  },
  "stream-time": {
    label: "On Air",
    icon: Clock3,
    iconTint: "text-emerald-200",
    chip: "border-[#c48652]/70 bg-[#2f4a3d] text-emerald-100",
  },
  insult: {
    label: "Roast",
    icon: Laugh,
    iconTint: "text-amber-200",
    chip: "border-[#c48652]/70 bg-[#4a3a57] text-amber-50",
  },
  wordle: {
    label: "Wordle",
    icon: Puzzle,
    iconTint: "text-amber-200",
    chip: "border-[#c48652]/70 bg-[#2f4a3d] text-emerald-100",
  },
  bandle: {
    label: "Bandle",
    icon: Music2,
    iconTint: "text-amber-200",
    chip: "border-[#c48652]/70 bg-[#2b3952] text-amber-100",
  },
  // Default fallback for new categories
  chat: { label: "Chat", icon: MessageCircle, iconTint: "text-blue-200", chip: "border-blue-500/30 bg-blue-900/40 text-blue-100" },
  game: { label: "Game", icon: Gamepad2, iconTint: "text-purple-200", chip: "border-purple-500/30 bg-purple-900/40 text-purple-100" },
  love: { label: "Love", icon: Heart, iconTint: "text-rose-200", chip: "border-rose-500/30 bg-rose-900/40 text-rose-100" },
  brain: { label: "Trivia", icon: BrainCircuit, iconTint: "text-cyan-200", chip: "border-cyan-500/30 bg-cyan-900/40 text-cyan-100" },
};

const WIZARD_COOLDOWN_KEY = "stream-quest-wizard-cooldown";
const WIZARD_SILENCE_MS = 5 * 60 * 60 * 1000;
const WIZARD_SOUNDS = ["/audio/wizard1.mp3", "/audio/wizard2.mp3", "/audio/wizard3.mp3", "/audio/wizard4.mp3"];

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function StreamQuestClient() {
  const [data, setData] = useState<QuestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [celebratingId, setCelebratingId] = useState<string | null>(null);
  
  // Loading states for actions
  const [isRerollingQuestor, setIsRerollingQuestor] = useState(false);
  
  const [toast, setToast] = useState<string | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  
  const [authState, setAuthState] = useState<"checking" | "unauthenticated" | "ready">("checking");
  const questFinAudioRef = useRef<HTMLAudioElement | null>(null);
  const moneyAudioRef = useRef<HTMLAudioElement | null>(null);

  const triggerToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setIsToastVisible(true), 10);
    setTimeout(() => {
      setIsToastVisible(false);
      setTimeout(() => setToast(null), 500);
    }, 4000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/twitch/stream-quests", {
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401) {
        setAuthState("unauthenticated");
        setLoading(false);
        return;
      }

      const json = await res.json();

      if (json.error === "offline") {
        setAuthState("ready");
        setError("OFFLINE");
        setLoading(false);
        return;
      }

      if (!res.ok) throw new Error(json.error || "Failed to load daily quests");

      setData(json);
      setAuthState("ready");
      if (json.regenerated) {
        triggerToast("Rolled fresh daily quests for today.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not load Stream Quest. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [triggerToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalMinted = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.ledger).reduce((sum, value) => sum + value, 0);
  }, [data]);

  const playQuestCompletionAudio = useCallback(async () => {
    const questFin = questFinAudioRef.current;
    const money = moneyAudioRef.current;
    if (!questFin || !money) return;

    questFin.currentTime = 0;
    questFin.play().catch(() => {});

    setTimeout(() => {
      money.currentTime = 0;
      money.play().catch((err) => console.warn("Unable to play reward audio", err));
    }, 3000); 
  }, []);

  async function rerollQuests() {
    if (!confirm("Reroll available streamer quests? Completed quests will stay.")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/twitch/stream-quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reroll" }),
      });
      const json = await res.json();
      setData(json);
      triggerToast("Quests have been reshuffled!");
    } catch (err) {
      setError("Failed to reroll.");
    } finally {
      setLoading(false);
    }
  }

  // --- NEW: Reroll Chatter Questor ---
  async function rerollChatterQuestor() {
    if (data?.chatterRerollUsed) return;
    if (!confirm("Reroll the Daily Chatter? You can only do this once per day.")) return;
    
    setIsRerollingQuestor(true);
    try {
        const res = await fetch("/api/twitch/stream-quests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reroll_questor" }),
        });
        const json = await res.json();
        if(json.error) throw new Error(json.error);
        setData(json);
        triggerToast(`New Questor selected: ${json.dailyQuestor}`);
    } catch(err: any) {
        triggerToast(`Reroll failed: ${err.message}`);
    } finally {
        setIsRerollingQuestor(false);
    }
  }

  // --- NEW: Claim Chatter Quest ---
  async function completeChatterQuest(id: string) {
      if(!data || completingId) return;
      setCompletingId(id);
      
      try {
          const res = await fetch("/api/twitch/stream-quests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "claim_chatter_quest", id }),
          });
          const json = await res.json();
          if(!res.ok) throw new Error(json.error);
          
          setData(prev => {
              if(!prev) return json;
              const updated = prev.chatterQuests.map(q => q.id === id ? { ...q, completed: true } : q);
              return { ...prev, chatterQuests: updated, ledger: json.ledger };
          });
          
          triggerToast(`Rewards sent to ${json.recipient}!`);
          void playQuestCompletionAudio();
      } catch(err: any) {
          triggerToast(err.message);
      } finally {
          setCompletingId(null);
      }
  }

  async function completeQuest(id: string) {
    if (!data || completingId) return; // Prevent double-clicks
    
    setCompletingId(id);
    setError(null);

    try {
        const res = await fetch("/api/twitch/stream-quests", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim", id }),
        });


        const json = await res.json();

        if (!res.ok) {
        throw new Error(json.error || "Server rejected the claim");
        }

        // Success: Update the local state
        setData(prev => {
        if (!prev) return json; 
        return {
            ...prev,
            quests: prev.quests.map(q => 
            q.id === id ? { ...q, completed: true } : q
            ),
            ledger: json.ledger 
        };
        });

        setCelebratingId(id);
        void playQuestCompletionAudio();
        triggerToast("Quest Claimed!");

    } catch (err: any) {
        console.error("Claim failed:", err);
        triggerToast(`Error: ${err.message}`); 
    } finally {
        setCompletingId(null);
    }
}

  // --- Logic Guards ---
  const isLive = !!data?.audience?.live;
  const isAuthed = data?.audience?.source === "twitch";
  const isActive = isLive && isAuthed;
  const showAuthBanner = authState === "unauthenticated" || (data && !isAuthed && !isLive);

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 animate-pulse">
        <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
        Loading Stream Quest…
      </div>
    );
  }

if (error === "OFFLINE") {
    return (
      <div className="flex flex-col items-center justify-center rounded-[32px] border border-amber-900/40 bg-[#1a0f0a]/90 p-12 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-500">
        <Lock className="mb-4 h-12 w-12 text-amber-600 animate-pulse" />
        <h2 className="text-2xl font-bold tracking-widest text-amber-100 uppercase">The Tavern is Closed</h2>
        <p className="mt-2 text-amber-50/60 text-balance max-w-md">
          Quests are only available while your stream is live.
        </p>
        <button 
          onClick={() => loadData()}
          className="mt-6 flex items-center gap-2 rounded-full bg-amber-600/20 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-400 border border-amber-600/30 hover:bg-amber-600/40 transition-all"
        >
          <Loader2 className={clsx("h-3 w-3", loading && "animate-spin")} />
          Check Stream Status
        </button>
      </div>
    );
  }

  if (error && authState !== "unauthenticated") {
    return (
      <div className="rounded-2xl border border-rose-200/70 bg-rose-50 px-4 py-3 text-rose-900 shadow-sm dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-100">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <audio ref={questFinAudioRef} src="/audio/questfin.mp3" preload="auto" aria-hidden className="hidden" />
      <audio ref={moneyAudioRef} src="/audio/money.mp3" preload="auto" aria-hidden className="hidden" />

      <MysticWizard />

      {/* --- ANIMATED TOAST --- */}
      {toast ? (
        <div 
          className={clsx(
            "fixed top-4 right-4 z-50 flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-amber-900 shadow-lg backdrop-blur transition-all duration-500 ease-out dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100",
            isToastVisible ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
          )}
        >
          <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-300" />
          <span className="font-semibold tracking-wide">{toast}</span>
        </div>
      ) : null}

      {/* --- ANIMATED AUTH BANNER --- */}
      {showAuthBanner ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/85 px-4 py-3 text-amber-900 shadow-sm backdrop-blur dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-50 animate-in fade-in slide-in-from-top-2 duration-700">
          <div className="space-y-1">
            <p className="text-sm font-semibold">Connect Twitch to enable quests</p>
            <p className="text-xs opacity-80">
              You need to authorize and be live for Stream Quest to activate. Otherwise quests stay locked.
            </p>
          </div>
          <a
            href="/api/twitch/login?redirect=%2Ftwitch%2Fstream-quest"
            className="rounded-full border border-amber-300/80 bg-amber-900/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-50 shadow-sm transition hover:scale-[1.02] active:scale-100"
          >
            Authorize Twitch
          </a>
        </div>
      ) : null}

      {data && (
        <>
          {/* --- STREAMER QUESTS SECTION --- */}
          <section className="relative overflow-hidden rounded-[32px] border border-amber-300/20 bg-[#1a0f0a]/85 px-4 py-8 shadow-[0_25px_60px_rgba(0,0,0,0.45)] backdrop-blur md:px-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.06),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,183,94,0.12),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(0,0,0,0.45),transparent_40%)]" />

            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <p className="text-4xl font-bold uppercase tracking-[0.32em] text-amber-100/80 drop-shadow">
                  Daily Stream Quest
                </p>
                <p className="max-w-2xl text-sm text-amber-50/80 drop-shadow">
                  Do your dailies, streamer.
                </p>
                <button
                  onClick={rerollQuests}
                  className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-200 transition hover:bg-amber-500/20"
                >
                  <Sparkles className="h-3 w-3" />
                  Reroll Quests
                </button>
              </div>

              <div className="flex flex-col items-end gap-2 text-right">
                <div className="flex items-center gap-2 rounded-full border border-amber-300/60 bg-amber-900/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100 shadow-sm backdrop-blur">
                  <Clock3 className="h-4 w-4" />
                  Resets daily
                </div>
                <AudienceBadge audience={data.audience} />
              </div>
            </div>

            {!isActive ? (
              <div className="relative mt-4 rounded-2xl border border-amber-900/40 bg-amber-950/60 px-4 py-3 text-sm text-amber-50 shadow-inner animate-in fade-in duration-1000">
                Quests unlock when you are live and authorized with Twitch. Connect above and go live to start stamping.
              </div>
            ) : null}

            <div className="relative mt-8 grid auto-rows-fr items-stretch gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {data.quests.map((quest) => (
                <QuestTile
                  key={quest.id}
                  quest={quest}
                  onComplete={() => completeQuest(quest.id)}
                  completing={completingId === quest.id}
                  celebrating={celebratingId === quest.id}
                  isActive={isActive}
                />
              ))}
            </div>

            <div className="relative mt-10 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/25 bg-black/30 px-4 py-3 text-sm text-amber-50 shadow-inner">
              <Coins className="h-4 w-4 text-amber-200" />
              <span className="font-semibold">{totalMinted.toLocaleString()} toadcoins minted across chat today.</span>
              <span className="text-amber-100/70">Quests grey out after completion until the next reset.</span>
            </div>
          </section>

          {/* --- CHATTER QUESTS SECTION --- */}
          <section className="relative overflow-hidden rounded-[28px] border border-amber-300/15 bg-[#140c07]/80 px-4 py-6 shadow-[0_18px_45px_rgba(0,0,0,0.4)] backdrop-blur md:px-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.05),transparent_35%),radial-gradient(circle_at_90%_40%,rgba(255,183,94,0.08),transparent_45%)]" />

            <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-2xl font-bold uppercase tracking-[0.28em] text-amber-100/80">
                  Daily Chatter Quests
                </p>
                <p className="text-sm text-amber-50/70">
                  Three quests for one chosen chatter. Rewards go only to today&apos;s questor.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-amber-300/40 bg-amber-900/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
                  Today&apos;s Daily Questor: <span className="text-amber-300">{data.dailyQuestor}</span>
                </span>
                <button
                  type="button"
                  onClick={rerollChatterQuestor}
                  disabled={data.chatterRerollUsed || isRerollingQuestor}
                  className={clsx(
                    "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest transition",
                    (data.chatterRerollUsed || isRerollingQuestor)
                      ? "cursor-not-allowed border-amber-700/40 bg-amber-900/20 text-amber-200/50"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                  )}
                >
                   {isRerollingQuestor ? (
                     <Loader2 className="h-3 w-3 animate-spin" />
                   ) : (
                     <Sparkles className="h-3 w-3" />
                   )}
                  {data.chatterRerollUsed ? "Reroll Used" : "Reroll Questor"}
                </button>
              </div>
            </div>

            <div className="relative mt-6 grid gap-4 md:grid-cols-3">
              {data.chatterQuests.map((quest) => (
                <button
                  key={quest.id}
                  type="button"
                  disabled={quest.completed || completingId === quest.id}
                  onClick={() => completeChatterQuest(quest.id)}
                  className={clsx(
                    "group flex h-full flex-col rounded-2xl border px-4 py-4 text-left transition relative overflow-hidden",
                    quest.completed
                      ? "border-emerald-500/20 bg-emerald-950/20 text-emerald-100/50"
                      : "border-amber-300/20 bg-black/25 text-amber-50 hover:border-amber-300/40 hover:bg-black/40 hover:shadow-lg"
                  )}
                >
                  <div className="flex items-start justify-between gap-3 relative z-10">
                    <span className="text-sm font-semibold text-amber-100/80">Chatter Quest</span>
                    <span
                      className={clsx(
                        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em]",
                        quest.completed
                          ? "border-emerald-400/40 bg-emerald-900/20 text-emerald-200/70"
                          : "border-amber-400/30 bg-amber-900/20 text-amber-200/70"
                      )}
                    >
                      {quest.completed ? "Done" : "Active"}
                    </span>
                  </div>
                  <p className={clsx("mt-3 text-sm leading-relaxed relative z-10", quest.completed && "line-through opacity-70")}>
                    {quest.prompt}
                  </p>
                  <div className="mt-auto pt-4 text-xs text-amber-100/70 relative z-10">
                    Reward: <span className="font-semibold text-amber-100">{quest.reward} coins</span>
                  </div>
                  
                  {completingId === quest.id && (
                     <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[1px] z-20">
                         <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                     </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ... Rest of the components (MysticWizard, AudienceBadge, QuestTile) remain unchanged from your original file ...
// (Include them here exactly as they were in your provided uploaded file)

function MysticWizard() {
    const [visible, setVisible] = useState(false);
    const [opacity, setOpacity] = useState(0);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [tilt, setTilt] = useState(0);
    const [fading, setFading] = useState(false);
    const [caught, setCaught] = useState(false);
    const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
    const [mounted, setMounted] = useState(false);
  
    const containerRef = useRef<HTMLDivElement | null>(null);
    const spawnTimeout = useRef<NodeJS.Timeout | null>(null);
    const fadeTimeout = useRef<NodeJS.Timeout | null>(null);
    const movementInterval = useRef<NodeJS.Timeout | null>(null);
    const cooldownTimer = useRef<NodeJS.Timeout | null>(null);
    const soundRefs = useRef<HTMLAudioElement[]>([]);
  
    const cooldownActive = useMemo(() => (cooldownUntil ? cooldownUntil > Date.now() : false), [cooldownUntil]);
    const interactive = visible && !fading && !caught && !cooldownActive && opacity > 0.5;
    const shouldRender = visible || fading || caught;
  
    const beginFadeOut = useCallback(() => {
      setFading(true);
      setOpacity(0);
      if (fadeTimeout.current) clearTimeout(fadeTimeout.current);
      fadeTimeout.current = setTimeout(() => {
        setVisible(false);
        setFading(false);
      }, 900);
    }, []);
  
    const spawnWizard = useCallback(() => {
      if (!mounted || cooldownActive) return;
      const bounds = containerRef.current?.getBoundingClientRect();
      const width = bounds?.width ?? (typeof window !== "undefined" ? window.innerWidth : 800);
      const height = bounds?.height ?? (typeof window !== "undefined" ? window.innerHeight : 600);
      const margin = 140;
  
      const x = randomBetween(margin, Math.max(margin, Math.floor(width - margin)));
      const y = randomBetween(margin, Math.max(margin, Math.floor(height - margin)));
  
      setPosition({ x, y });
      setTilt(randomBetween(-8, 8));
      setCaught(false);
      setFading(false);
      setOpacity(0);
      setVisible(true);
  
      requestAnimationFrame(() => setOpacity(1));
  
      if (fadeTimeout.current) clearTimeout(fadeTimeout.current);
      fadeTimeout.current = setTimeout(() => beginFadeOut(), randomBetween(16000, 26000));
    }, [beginFadeOut, cooldownActive, mounted]);
  
    const playRandomSound = useCallback(() => {
      const available = soundRefs.current.filter(Boolean);
      if (!available.length) return;
      const pick = available[randomBetween(0, available.length - 1)];
      if (!pick) return;
      pick.currentTime = 0;
      pick.volume = 0.6;
      pick.play().catch((err) => console.warn("Wizard sound failed to play", err));
    }, []);
  
    const handleCapture = () => {
      if (!interactive) return;
      setCaught(true);
      playRandomSound();
      const until = Date.now() + WIZARD_SILENCE_MS;
      if (typeof window !== "undefined") {
        localStorage.setItem(WIZARD_COOLDOWN_KEY, String(until));
      }
      setCooldownUntil(until);
      setOpacity(0);
      if (fadeTimeout.current) clearTimeout(fadeTimeout.current);
      fadeTimeout.current = setTimeout(() => {
        setVisible(false);
        setFading(false);
        setCaught(false);
      }, 650);
    };
  
    useEffect(() => {
      setMounted(true);
      if (typeof window !== "undefined") {
        const stored = Number(localStorage.getItem(WIZARD_COOLDOWN_KEY));
        if (Number.isFinite(stored) && stored > Date.now()) {
          setCooldownUntil(stored);
        }
      }
    }, []);
  
    useEffect(() => {
      if (process.env.NODE_ENV === "development") {
        (window as any).forceWizard = () => {
          setCooldownUntil(null);
          localStorage.removeItem(WIZARD_COOLDOWN_KEY);
          spawnWizard();
        };
      }
      return () => { delete (window as any).forceWizard; };
    }, [spawnWizard]);
  
    useEffect(() => {
      if (!cooldownActive) return undefined;
      const remaining = Math.max(1000, (cooldownUntil ?? 0) - Date.now());
      cooldownTimer.current = setTimeout(() => setCooldownUntil(null), remaining);
      return () => { if (cooldownTimer.current) clearTimeout(cooldownTimer.current); };
    }, [cooldownActive, cooldownUntil]);
  
    useEffect(() => {
      if (!mounted || cooldownActive || visible || fading || caught) return undefined;
      spawnTimeout.current = setTimeout(() => spawnWizard(), randomBetween(20000, 65000));
      return () => { if (spawnTimeout.current) clearTimeout(spawnTimeout.current); };
    }, [mounted, cooldownActive, visible, fading, caught, spawnWizard]);
  
    useEffect(() => {
      if (!visible) return undefined;
      movementInterval.current = setInterval(() => {
        setTilt(randomBetween(-12, 12));
        setPosition((prev) => {
          const bounds = containerRef.current?.getBoundingClientRect();
          const width = bounds?.width ?? (typeof window !== "undefined" ? window.innerWidth : 800);
          const height = bounds?.height ?? (typeof window !== "undefined" ? window.innerHeight : 600);
          const margin = 140;
          const nextX = clamp(prev.x + randomBetween(-250, 250), margin, Math.max(margin, width - margin));
          const nextY = clamp(prev.y + randomBetween(-180, 180), margin, Math.max(margin, height - margin));
          return { x: nextX, y: nextY };
        });
      }, 3000); 
      return () => { if (movementInterval.current) clearInterval(movementInterval.current); };
    }, [visible]);
  
    useEffect(() => {
      return () => {
        if (spawnTimeout.current) clearTimeout(spawnTimeout.current);
        if (fadeTimeout.current) clearTimeout(fadeTimeout.current);
        if (movementInterval.current) clearInterval(movementInterval.current);
        if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
      };
    }, []);
  
    const scale = caught ? 0.82 : 1.0;
  
    return (
      <div ref={containerRef} className="pointer-events-none fixed inset-0 z-30">
        {shouldRender ? (
          <div
            style={{
              left: position.x,
              top: position.y,
              opacity,
              transform: `translate(-50%, -50%) scale(${scale}) rotate(${tilt}deg)`,
              transition: "opacity 0.8s ease, transform 2.8s cubic-bezier(0.45, 0, 0.55, 1), left 2.8s cubic-bezier(0.45, 0, 0.55, 1), top 2.8s cubic-bezier(0.45, 0, 0.55, 1)",
            }}
            className="absolute"
          >
            <button
              type="button"
              aria-label="Catch the wandering wizard"
              onClick={handleCapture}
              className={clsx(
                "group relative block rounded-full bg-transparent transition-transform duration-300",
                interactive ? "pointer-events-auto hover:scale-110" : "pointer-events-none"
              )}
            >
              <div
                className={clsx(
                  "relative rounded-full transition-all duration-500 wizard-floating",
                  interactive ? "wizard-shake" : "",
                  caught ? "wizard-squish" : ""
                )}
              >
                <div 
                  className="absolute inset-4 rounded-full bg-amber-200/20 blur-3xl transition-all duration-300 group-hover:bg-amber-300/40 group-hover:scale-125" 
                  aria-hidden 
                />
                <Image
                  src="/images/wizard.png"
                  alt="Tiny quest wizard sprite"
                  width={200}
                  height={200}
                  className={clsx(
                    "relative z-10 h-auto w-48 select-none drop-shadow-[0_15px_35px_rgba(0,0,0,0.5)] md:w-56",
                    "transition-all duration-300 group-hover:rotate-12 group-hover:brightness-110"
                  )}
                  draggable={false}
                  priority={true}
                  unoptimized
                />
                {interactive && (
                  <div className="absolute -right-4 -top-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <Sparkles className="h-8 w-8 animate-pulse text-amber-300" />
                  </div>
                )}
              </div>
            </button>
          </div>
        ) : null}
  
        {WIZARD_SOUNDS.map((src, index) => (
          <audio
            key={src}
            ref={(el) => { if (el) soundRefs.current[index] = el; }}
            src={src}
            preload="auto"
            aria-hidden
            className="hidden"
          />
        ))}
      </div>
    );
  }
  
  function AudienceBadge({ audience }: { audience: AudienceSnapshot }) {
    const Icon = audience.live ? Sparkles : Ghost;
    const bg = audience.source === "twitch"
        ? "bg-emerald-900/60 text-emerald-100 border-emerald-200/50"
        : "bg-amber-900/60 text-amber-100 border-amber-200/50";
  
    return (
      <div className={clsx("flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] shadow-sm backdrop-blur", bg)}>
        <Icon className="h-4 w-4" />
        {audience.live ? "Live chat linked" : "Placeholder chat"}
      </div>
    );
  }
  
  function QuestTile({
    quest,
    onComplete,
    completing,
    celebrating,
    isActive,
  }: {
    quest: StreamQuest;
    onComplete: () => void;
    completing: boolean;
    celebrating: boolean;
    isActive: boolean;
  }) {
    const meta = categoryMeta[quest.category] || categoryMeta["stream-time"];
    const Icon = meta.icon;
    const isCompleted = quest.completed;
  
    return (
      <button
        type="button"
        onClick={!isCompleted && isActive ? onComplete : undefined}
        disabled={!isActive || isCompleted || completing}
        className={clsx(
          "group relative isolate h-full w-full max-w-[420px] rounded-[32px] text-left transition-all duration-300",
          // The "Squish" effect on click
          !isCompleted && isActive 
            ? "hover:-translate-y-2 active:scale-95 active:rotate-1 cursor-pointer" 
            : "cursor-not-allowed opacity-90"
        )}
      >
        {/* --- 1. SHIMMER EFFECT LAYER --- */}
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[32px]">
          <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-transform duration-1000 group-hover:translate-x-[50%] group-hover:opacity-100 group-hover:rotate-12" />
        </div>
  
        <div className="absolute top-6 left-4 z-40 flex items-center gap-3">
          <span className="rounded-full bg-[#b58200] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-50 shadow-lg">
            Daily
          </span>
        </div>
  
        <div className={clsx(
            "relative flex aspect-[1.5/1] min-h-[220px] w-full overflow-hidden rounded-[26px] bg-[url('/images/questplate.png')] bg-cover bg-center bg-no-repeat px-5 pb-14 pt-15 shadow-[0_18px_36px_rgba(0,0,0,0.35)] transition-all duration-500",
            !isCompleted && isActive 
              ? "group-hover:shadow-[0_30px_60px_rgba(251,191,36,0.2)] group-hover:border-amber-400/30" 
              : ""
          )}>
          
          {/* --- 2. THE MAIN CONTENT CARD --- */}
          <div className="relative z-10 flex flex-1 flex-col gap-3 rounded-2xl border-2 border-[#c48652] bg-[#23354c] px-4 py-4 shadow-inner transition-transform duration-500 group-hover:scale-[1.01]">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#c48652]/60 bg-[#0f1b2b] text-amber-50 shadow-md group-hover:rotate-6 transition-transform">
                <Icon className={clsx("h-6 w-6", meta.iconTint)} />
              </div>
  
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-amber-50 drop-shadow-sm group-hover:text-white transition-colors">
                    {quest.title}
                  </span>
                  <span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest", meta.chip)}>
                    {meta.label}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-amber-50/70 group-hover:text-amber-50/90 transition-colors">
                  {quest.prompt}
                </p>
              </div>
            </div>
  
            <div className="mt-auto flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
                <Coins className="h-4 w-4" />
                <span>{quest.reward} TOADCOINS</span>
              </div>
            </div>
          </div>
  
          {/* --- 3. UNRAVEL / REVEAL EFFECT (When completed) --- */}
          {isCompleted && (
            <div 
              className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0f1b2b]/90 backdrop-blur-md animate-unravel"
              style={{ clipPath: 'circle(150% at 50% 50%)' }}
            >
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
                <BadgeCheck className="h-12 w-12 text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
              </div>
              <span className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-emerald-100">
                Quest Complete
              </span>
              <div className="absolute inset-0 border-4 border-emerald-500/30 rounded-[26px]" />
            </div>
          )}
  
          {completing && (
             <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
             </div>
          )}
        </div>
      </button>
    );
  }