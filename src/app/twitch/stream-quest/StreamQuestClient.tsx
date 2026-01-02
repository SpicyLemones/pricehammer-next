"use client";

import Image from "next/image";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Ban,
  Clock3,
  Coins,
  Crown,
  Ghost,
  Laugh,
  Loader2,
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
    accent: string;
    chip: string;
  }
> = {
  prime: {
    label: "Subs",
    icon: Crown,
    accent: "from-amber-50 via-yellow-100 to-amber-50",
    chip: "text-amber-900 bg-amber-100 border-amber-200",
  },
  ban: {
    label: "Ban",
    icon: Ban,
    accent: "from-rose-50 via-orange-50 to-amber-50",
    chip: "text-rose-900 bg-rose-100 border-rose-200",
  },
  timeout: {
    label: "Timeout",
    icon: Timer,
    accent: "from-blue-50 via-sky-50 to-emerald-50",
    chip: "text-blue-900 bg-blue-100 border-blue-200",
  },
  "stream-time": {
    label: "On Air",
    icon: Clock3,
    accent: "from-emerald-50 via-lime-50 to-amber-50",
    chip: "text-emerald-900 bg-emerald-100 border-emerald-200",
  },
  insult: {
    label: "Roast",
    icon: Laugh,
    accent: "from-purple-50 via-indigo-50 to-amber-50",
    chip: "text-purple-900 bg-purple-100 border-purple-200",
  },
  wordle: {
    label: "Wordle",
    icon: Puzzle,
    accent: "from-slate-50 via-emerald-50 to-amber-50",
    chip: "text-emerald-900 bg-emerald-100 border-emerald-200",
  },
  bandle: {
    label: "Bandle",
    icon: Music2,
    accent: "from-sky-50 via-indigo-50 to-amber-50",
    chip: "text-sky-900 bg-sky-100 border-sky-200",
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

  const topHolders = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.ledger)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [data]);

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
      {toast ? (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
          <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-300" />
          <span className="font-semibold tracking-wide">{toast}</span>
        </div>
      ) : null}

      {showAuthBanner ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-amber-900 shadow-sm dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-50">
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

      {/* BOARD: render the PNG once as an actual image so it NEVER crops */}
      <div className="relative mx-auto w-full max-w-[1800px]">
        <div className="relative aspect-[16/9] overflow-visible rounded-3xl">
          <Image
            src="/images/questboard.png"
            alt=""
            fill
            priority
            className="pointer-events-none select-none object-contain"
          />

          {/* Overlay */}
          <div className="absolute inset-0 rounded-3xl px-6 py-6">
            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_top_left,rgba(0,0,0,0.25),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(0,0,0,0.4),transparent_40%)]" />

            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-100/80 drop-shadow">
                  Daily Stream Quest
                </p>
                <h1 className="text-4xl font-semibold leading-none text-amber-50 drop-shadow">
                  Five quests. 500 Toadcoins each.
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-amber-50/80 drop-shadow">
                  Click COMPLETE once you finish a dare on stream. Each completion drops coins to the current
                  chatter list when you&apos;re live and connected.
                </p>
              </div>

              <div className="flex flex-col items-end gap-2 text-right">
                <div className="flex items-center gap-2 rounded-full border border-amber-200/60 bg-amber-900/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100 shadow-sm backdrop-blur">
                  <Clock3 className="h-4 w-4" />
                  Resets daily
                </div>
                <AudienceBadge audience={data.audience} />
              </div>
            </div>

            {!isActive ? (
              <div className="relative mt-4 rounded-2xl border border-amber-900/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-50 shadow-inner">
                Quests unlock when you are live and authorized with Twitch. Connect above and go live to start
                stamping.
              </div>
            ) : null}

            {/* IMPORTANT: auto-fit prevents the “bounded weird cut” layout */}
            <div className="relative mt-6 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
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
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LedgerCard totalMinted={totalMinted} topHolders={topHolders} audience={data.audience} />
        </div>

        <div className="rounded-2xl border border-amber-200/70 bg-white/80 p-4 shadow-sm dark:border-amber-900/70 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-amber-800 dark:text-amber-100">
            <Sparkles className="h-4 w-4" />
            Rewards
          </div>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
            Each quest drops <strong>500 Toadcoins</strong> to everyone watching in chat (or to the standby
            roster when you&apos;re offline). Quests grey out after completion until the next reset.
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-amber-900 shadow-inner dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            <Coins className="h-5 w-5" />
            <span className="text-sm font-semibold">
              {totalMinted.toLocaleString()} toadcoins minted across chat.
            </span>
          </div>
        </div>
      </div>
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
      onClick={quest.completed ? undefined : onComplete}
      disabled={!isActive || quest.completed || completing}
      className={clsx(
        "group relative h-full overflow-hidden rounded-2xl border text-left shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition duration-200",
        "bg-slate-950/70 backdrop-blur-sm",
        isCompleted
          ? "cursor-not-allowed border-slate-300/30 text-slate-200/70 grayscale"
          : "border-amber-200/40 hover:-translate-y-[6px] hover:shadow-[0_18px_40px_rgba(0,0,0,0.25)] active:translate-y-[1px]"
      )}
    >
      <div
        className={clsx(
          "absolute inset-0 bg-gradient-to-br opacity-70 transition duration-300",
          meta.accent,
          quest.completed ? "brightness-75" : "group-hover:opacity-100 group-hover:brightness-110"
        )}
      />

      <div
        className={clsx(
          "absolute inset-0 bg-black/40 transition duration-300 opacity-0 group-hover:opacity-20",
          isCompleted && "opacity-50"
        )}
      />

      {celebrating ? <CelebrationBurst /> : null}

      {!isCompleted && isActive ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rotate-[-10deg] text-3xl font-black uppercase tracking-[0.35em] text-emerald-400 opacity-0 drop-shadow-[0_0_16px_rgba(16,185,129,0.35)] transition duration-300 group-hover:-translate-y-1 group-hover:scale-[1.03] group-hover:opacity-100">
            COMPLETE
          </span>
        </div>
      ) : null}

      <div className={clsx("relative flex h-full flex-col gap-3 p-5", isCompleted && "opacity-80")}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 rounded-full border border-amber-300/40 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-50 shadow-sm">
            <Sparkles className="h-4 w-4" />
            Daily
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-amber-300/40 bg-white/10 px-3 py-1 text-sm font-semibold text-amber-50 shadow-sm">
            <Coins className="h-4 w-4" />
            {quest.reward ?? 500}
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/10 px-3 py-3 shadow-inner backdrop-blur-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-amber-200/30 bg-gradient-to-br from-white/20 to-amber-50/10 shadow-sm">
            <Icon className="h-6 w-6 text-amber-100" />
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold leading-snug break-words text-amber-50 drop-shadow-sm">
                {quest.title}
              </span>

              <span
                className={clsx(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em]",
                  meta.chip,
                  "border-white/10 bg-white/5 text-white/80"
                )}
              >
                {meta.label}
              </span>
            </div>

            <p className="text-sm leading-relaxed break-words text-pretty text-slate-100/90">
              {quest.prompt}
            </p>
          </div>
        </div>

        {isCompleted ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rotate-[-12deg] text-3xl font-black uppercase tracking-[0.35em] text-emerald-400 drop-shadow-[0_0_16px_rgba(74,222,128,0.45)]">
              QUEST COMPLETE
            </span>
          </div>
        ) : null}
      </div>
    </button>
  );
}

function LedgerCard({
  totalMinted,
  topHolders,
  audience,
}: {
  totalMinted: number;
  topHolders: Array<[string, number]>;
  audience: AudienceSnapshot;
}) {
  return (
    <div className="h-full rounded-2xl border border-amber-200/70 bg-white/85 p-5 shadow-sm dark:border-amber-900/60 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-800 dark:text-amber-100">
            Toadcoin Ledger
          </p>
          <h2 className="text-2xl font-semibold text-amber-900 dark:text-amber-50">
            Chat balance sheet
          </h2>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {audience.live
              ? "Live chat is connected. Rewards will mint straight to the current chatter list."
              : "Using placeholder chatters until Twitch auth is connected or the stream is live."}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-2 text-amber-900 shadow-inner dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <Coins className="h-5 w-5" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.25em]">
              Minted Today
            </div>
            <div className="text-lg font-bold">{totalMinted.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {topHolders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-200 px-4 py-3 text-sm text-amber-900/80 dark:border-amber-800 dark:text-amber-100/80">
            Complete a quest to start minting coins to chatters.
          </div>
        ) : (
          topHolders.map(([name, amount], idx) => (
            <div
              key={name}
              className="flex items-center gap-3 rounded-xl border border-amber-200/80 bg-white/80 px-3 py-2 shadow-sm dark:border-amber-800/70 dark:bg-amber-950/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-lg font-black text-amber-950 shadow-inner">
                {idx + 1}
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-amber-900 dark:text-amber-50">
                  {name}
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800/80 dark:text-amber-100/70">
                  {amount.toLocaleString()} coins
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CelebrationBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="absolute h-40 w-40 rounded-full bg-amber-200/50 blur-3xl" />
      <div className="relative flex items-center gap-2 text-amber-800">
        <Sparkles className="h-6 w-6 animate-ping" />
        <Sparkles className="h-5 w-5 animate-pulse delay-150" />
        <Sparkles className="h-4 w-4 animate-ping delay-300" />
      </div>
    </div>
  );
}
