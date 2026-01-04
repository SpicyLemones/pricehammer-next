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
} from "lucide-react";

import clsx from "clsx";

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

type QuestResponse = {
  regenerated?: boolean;
  date: string;
  generatedAt: string;
  quests: StreamQuest[];
  ledger: Record<string, number>;
  audience: AudienceSnapshot;
};

const categoryMeta: Record<
  QuestCategory,
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
      const res = await fetch("/api/twitch/stream-quests");

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
    if (!confirm("Reroll available quests? Completed quests will stay.")) return;
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

  async function completeQuest(id: string) {
  if (!data || completingId) return; // Prevent double-clicks
  
  setCompletingId(id);
  setError(null);

  try {
    const res = await fetch("/api/twitch/stream-quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Important: Send the quest ID so the server knows which one to mark
      body: JSON.stringify({ id }), 
    });

    const json = await res.json();

    if (!res.ok) {
      // If the server says "No", we show the error but DON'T refresh
      throw new Error(json.error || "Server rejected the claim");
    }

    // Success: Update the local state so they don't reshuffle
    setData(json); 
    setCelebratingId(id);
    void playQuestCompletionAudio();
    triggerToast("Quest Claimed!");

  } catch (err: any) {
    console.error("Claim failed:", err);
    triggerToast(`Error: ${err.message}`); 
    // We do NOT reload here, so the quests stay where they are
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
      <div className="flex flex-col items-center justify-center rounded-[32px] border border-amber-900/40 bg-[#1a0f0a]/90 p-12 text-center shadow-2xl">
        <Lock className="mb-4 h-12 w-12 text-amber-600 animate-pulse" />
        <h2 className="text-2xl font-bold tracking-widest text-amber-100 uppercase">The Tavern is Closed</h2>
        <p className="mt-2 text-amber-50/60 text-balance max-w-md">
          Quests are only available while your stream is live. Go live on Twitch to unlock today's rewards!
        </p>
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
            "flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-amber-900 shadow-lg backdrop-blur transition-all duration-500 ease-out dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100",
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
      )}
    </div>
  );
}

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
  const meta = categoryMeta[quest.category];
  const Icon = meta.icon;
  const isCompleted = quest.completed;

  return (
    <button
      type="button"
      onClick={!isCompleted && isActive ? onComplete : undefined}
      disabled={!isActive || isCompleted || completing}
      className={clsx(
        "group relative isolate h-full w-full max-w-[420px] rounded-[32px] text-left transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-200",
        !isCompleted && isActive ? "hover:-translate-y-1 active:translate-y-0" : "cursor-not-allowed opacity-90"
      )}
    >
      <div className="absolute top-6 left-4 z-10 flex items-center gap-3">
        <span className="rounded-full bg-[#b58200] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-50 shadow-[0_8px_18px_rgba(0,0,0,0.45)]">
          Daily
        </span>
      </div>

      <div className={clsx(
          "relative flex aspect-[1.5/1] min-h-[220px] w-full overflow-hidden rounded-[26px] bg-[url('/images/questplate.png')] bg-cover bg-center bg-no-repeat px-5 pb-14 pt-15 shadow-[0_18px_36px_rgba(0,0,0,0.35)]",
          "before:absolute before:-inset-2 before:-z-10 before:rounded-[30px] before:bg-[radial-gradient(circle_at_center,rgba(222, 174, 161, 0.35),transparent_55%)] before:opacity-70 before:blur-xl before:transition-all before:duration-300",
          !isCompleted && isActive ? "hover:before:opacity-100 hover:shadow-[0_22px_40px_rgba(0,0,0,0.42)]" : "before:opacity-40"
        )}>
        <div className="relative z-10 flex flex-1 flex-col gap-3 rounded-2xl border-2 border-[#c48652] bg-[#23354c] px-4 py-4 shadow-inner">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#c48652]/60 bg-[#0f1b2b] text-amber-50 shadow-[0_8px_18px_rgba(0,0,0,0.35)]">
              <Icon className={clsx("h-6 w-6", meta.iconTint)} />
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-words text-balance text-[clamp(1rem,0.7vw+0.95rem,1.25rem)] font-semibold leading-snug text-amber-50 drop-shadow-sm">
                  {quest.title}
                </span>
                <span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em]", meta.chip)}>
                  {meta.label}
                </span>
              </div>
              <p className="break-words text-justify text-pretty text-[clamp(0.95rem,0.55vw+0.85rem,1.05rem)] leading-relaxed text-amber-50/80">
                {quest.prompt}
              </p>
            </div>
          </div>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100/90">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-200" />
              <span>{quest.reward ?? 500} Toadcoins</span>
            </div>
            {completing ? (
              <div className="flex items-center gap-2 text-amber-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Processing…
              </div>
            ) : isCompleted ? (
              <div className="flex items-center gap-2 text-emerald-200">
                <BadgeCheck className="h-3.5 w-3.5" />
                QUEST COMPLETE
              </div>
            ) : isActive ? (
              <div className="text-amber-50/80">Click to complete</div>
            ) : (
              <div className="flex items-center gap-2 text-amber-100/60">
                <Lock className="h-3.5 w-3.5" />
                Locked
              </div>
            )}
          </div>
        </div>
        {celebrating ? <CelebrationBurst /> : null}
        {isCompleted ? (
          <div className="pointer-events-none absolute inset-0 z-20 rounded-[26px] bg-[#0f1b2b]/70 backdrop-blur-[1px] animate-in fade-in duration-500">
            <div className="absolute inset-2 rounded-[22px] border-2 border-emerald-300/50" />
            <div className="relative flex h-full items-center justify-center gap-3 text-emerald-100 drop-shadow">
              <BadgeCheck className="h-5 w-5" />
              <span className="text-sm font-black uppercase tracking-[0.28em]">QUEST COMPLETE</span>
            </div>
          </div>
        ) : null}
      </div>
    </button>
  );
}

function CelebrationBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="absolute h-44 w-44 rounded-full bg-[#f06a4c]/30 blur-3xl" />
      <div className="relative flex items-center gap-2 text-amber-50">
        <Sparkles className="h-6 w-6 animate-ping" />
        <Sparkles className="h-5 w-5 animate-pulse delay-150" />
        <Sparkles className="h-4 w-4 animate-ping delay-300" />
      </div>
    </div>
  );
}