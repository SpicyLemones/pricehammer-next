"use client";
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

export function StreamQuestClient() {
  const [data, setData] = useState<QuestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [celebratingId, setCelebratingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [authState, setAuthState] = useState<
    "checking" | "unauthenticated" | "ready"
  >("checking");
  const questFinAudioRef = useRef<HTMLAudioElement | null>(null);
  const moneyAudioRef = useRef<HTMLAudioElement | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/twitch/stream-quests");
      if (res.status === 401) {
        setAuthState("unauthenticated");
        return;
      }
      if (!res.ok) throw new Error("Failed to load daily quests");
      const json = (await res.json()) as QuestResponse;
      setData(json);
      setAuthState("ready");
      if (json.regenerated) {
        setToast("Rolled fresh daily quests for today.");
      }
    } catch (err) {
      console.error(err);
      setError("Could not load Stream Quest. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const totalMinted = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.ledger).reduce((sum, value) => sum + value, 0);
  }, [data]);

  const playQuestCompletionAudio = useCallback(async () => {
    const questFin = questFinAudioRef.current;
    const money = moneyAudioRef.current;

    if (!questFin || !money) return;

    const startedAt = Date.now();
    const waitForQuestFin = new Promise<void>((resolve) => {
      const finalize = () => {
        const elapsed = Date.now() - startedAt;
        if (elapsed >= 5000) {
          resolve();
        } else {
          setTimeout(resolve, 5000 - elapsed);
        }
      };

      const fallback = setTimeout(() => {
        questFin.removeEventListener("ended", handleComplete);
        questFin.removeEventListener("error", handleComplete);
        finalize();
      }, 20000);

      const handleComplete = () => {
        clearTimeout(fallback);
        finalize();
      };

      questFin.addEventListener("ended", handleComplete, { once: true });
      questFin.addEventListener("error", handleComplete, { once: true });
    });

    questFin.currentTime = 0;
    questFin.play().catch((err) => {
      console.warn("Unable to play quest completion audio", err);
    });

    await waitForQuestFin;

    money.currentTime = 0;
    money.play().catch((err) => {
      console.warn("Unable to play reward audio", err);
    });
  }, []);

  async function completeQuest(id: string) {
    if (!data) return;
    setCompletingId(id);
    setError(null);

    try {
      const res = await fetch("/api/twitch/stream-quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        throw new Error("Failed to complete quest");
      }

      const json = (await res.json()) as QuestResponse & {
        quest?: StreamQuest;
        recipients?: string[];
        totalRewarded?: number;
      };

      setData({
        date: json.date,
        generatedAt: json.generatedAt,
        quests: json.quests,
        ledger: json.ledger,
        audience: json.audience,
      });

      const recipientText =
        json.recipients && json.recipients.length > 0
          ? `Sent ${json.quest?.reward ?? 500} toadcoins to ${
              json.recipients.length
            } chatter${json.recipients.length === 1 ? "" : "s"}.`
          : "Marked as complete.";

      setToast(recipientText);
      setCelebratingId(id);
      setTimeout(() => setCelebratingId(null), 1200);
      void playQuestCompletionAudio();
    } catch (err) {
      console.error(err);
      setError("Could not mark the quest as completed.");
    } finally {
      setCompletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
        <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
        Loading Stream Quest…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-200/70 bg-rose-50 px-4 py-3 text-rose-900 shadow-sm dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-100">
        {error ?? "Something went wrong."}
      </div>
    );
  }

  const isLive = !!data.audience.live;
  const isAuthed = data.audience.source === "twitch";
  const isActive = isLive && isAuthed;
  const showAuthBanner = authState === "unauthenticated" || (!isAuthed && !isLive);

  return (
    <div className="space-y-6">
      <audio ref={questFinAudioRef} src="/audio/questfin.mp3" preload="auto" aria-hidden className="hidden" />
      <audio ref={moneyAudioRef} src="/audio/money.mp3" preload="auto" aria-hidden className="hidden" />

      {toast ? (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-amber-900 shadow-sm backdrop-blur dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
          <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-300" />
          <span className="font-semibold tracking-wide">{toast}</span>
        </div>
      ) : null}

      {showAuthBanner ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/85 px-4 py-3 text-amber-900 shadow-sm backdrop-blur dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-50">
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
          <div className="relative mt-4 rounded-2xl border border-amber-900/40 bg-amber-950/60 px-4 py-3 text-sm text-amber-50 shadow-inner">
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
    </div>
  );
}

function AudienceBadge({ audience }: { audience: AudienceSnapshot }) {
  const Icon = audience.live ? Sparkles : Ghost;
  const bg =
    audience.source === "twitch"
      ? "bg-emerald-900/60 text-emerald-100 border-emerald-200/50"
      : "bg-amber-900/60 text-amber-100 border-amber-200/50";

  return (
    <div
      className={clsx(
        "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] shadow-sm backdrop-blur",
        bg
      )}
    >
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
        !isCompleted && isActive
          ? "hover:-translate-y-1 active:translate-y-0"
          : "cursor-not-allowed opacity-90"
      )}
    >
      <div className="absolute top-6 left-4 z-10 flex items-center gap-3">
        <span className="rounded-full bg-[#b58200] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-50 shadow-[0_8px_18px_rgba(0,0,0,0.45)]">
          Daily
        </span>
      </div>

      <div
  className={clsx(
    // 1. Core Styles: bg-cover ensures the image stretches to fill the space
    "relative flex h-full overflow-hidden rounded-[26px]  bg-[url('/images/questplate.png')] bg-cover bg-center bg-no-repeat px-5 pb-14 pt-15 shadow-[0_18px_36px_rgba(0,0,0,0.35)]",
    
    // 2. The Glow (Optional): I kept 'before' in case you still want the outer glow. 
    // If you want that gone too, delete the next two lines.
    "before:absolute before:-inset-2 before:-z-10 before:rounded-[30px] before:bg-[radial-gradient(circle_at_center,rgba(222, 174, 161, 0.35),transparent_55%)] before:opacity-70 before:blur-xl before:transition-all before:duration-300",
    !isCompleted && isActive ? "hover:before:opacity-100 hover:shadow-[0_22px_40px_rgba(0,0,0,0.42)]" : "before:opacity-40"
  )}
>
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
                <span
                  className={clsx(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em]",
                    meta.chip
                  )}
                >
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
          <div className="pointer-events-none absolute inset-0 z-20 rounded-[26px] bg-[#0f1b2b]/70 backdrop-blur-[1px]">
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
