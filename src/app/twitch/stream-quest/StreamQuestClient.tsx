"use client";

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

type QuestCategory = "prime" | "ban" | "timeout" | "stream-time" | "insult" | "wordle" | "bandle";

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

type AccessState =
  | { status: "checking" }
  | { status: "unauthenticated" }
  | { status: "misconfigured"; missing?: string[] }
  | { status: "offline"; displayName?: string }
  | { status: "ready"; displayName?: string }
  | { status: "error" };
const tavernBoardBg = `url("/images/questboard.png")`;

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [celebratingId, setCelebratingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessState>({ status: "checking" });

  const loadAccess = useCallback(async () => {
    setAccess({ status: "checking" });
    setData(null);
    try {
      const statusRes = await fetch("/api/twitch/status");
      const status = (await statusRes.json()) as { configured?: boolean; missing?: string[] };
      if (!status?.configured) {
        setAccess({ status: "misconfigured", missing: status.missing ?? [] });
        return;
      }

      const chattersRes = await fetch("/api/twitch/chatters");
      if (chattersRes.status === 401) {
        setAccess({ status: "unauthenticated" });
        return;
      }
      if (!chattersRes.ok) {
        setAccess({ status: "error" });
        return;
      }

      const chatters = (await chattersRes.json()) as { live: boolean; displayName?: string };
      if (!chatters.live) {
        setAccess({ status: "offline", displayName: chatters.displayName });
        return;
      }
      setAccess({ status: "ready", displayName: chatters.displayName });
    } catch (err) {
      console.error(err);
      setAccess({ status: "error" });
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!(access.status === "ready" || access.status === "offline")) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/twitch/stream-quests");
      if (!res.ok) throw new Error("Failed to load daily quests");
      const json = (await res.json()) as QuestResponse;
      setData(json);
      if (json.regenerated) {
        setToast("Rolled fresh daily quests for today.");
      }
    } catch (err) {
      console.error(err);
      setError("Could not load Stream Quest. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [access.status]);

  useEffect(() => {
    loadAccess();
  }, [loadAccess]);

  useEffect(() => {
    if (access.status === "ready" || access.status === "offline") {
      loadData();
    }
  }, [access.status, loadData]);

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
          ? `Sent ${json.quest?.reward ?? 500} toadcoins to ${json.recipients.length} chatter${
              json.recipients.length === 1 ? "" : "s"
            }.`
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

  const isLive = !!data?.audience.live;
  const isAuthed = data?.audience.source === "twitch";
  const streamerName = data?.audience.displayName ?? ("displayName" in access ? access.displayName : undefined);
  const canShowQuests = access.status === "ready" || access.status === "offline";

  return (
    <div className="space-y-6 text-amber-50 drop-shadow">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-100/80">
          Daily Stream Quest
        </p>
        <h1 className="text-5xl font-semibold leading-tight text-amber-50">Stream Quest</h1>
        <p className="max-w-3xl text-lg text-amber-100/90">
          Five daily quests on a tavern board. Each one pays out 500 Toadcoins to every chatter when you click
          COMPLETE.
        </p>
      </div>

      {toast ? (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
          <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-300" />
          <span className="font-semibold tracking-wide">{toast}</span>
        </div>
      ) : null}

      {access.status === "checking" ? (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-amber-900 shadow-sm backdrop-blur dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-50">
          <Loader2 className="h-5 w-5 animate-spin text-amber-700 dark:text-amber-200" />
          Checking Twitch connection…
        </div>
      ) : null}

      {access.status === "misconfigured" ? (
        <div className="rounded-2xl border border-rose-300/70 bg-rose-50/80 px-4 py-3 text-rose-900 shadow-sm backdrop-blur dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-50">
          Twitch auth is not configured. Add TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI, and
          TWITCH_STATE_SECRET then reload.{" "}
          {access.missing?.length ? (
            <span className="text-xs opacity-80">Missing: {access.missing.join(", ")}</span>
          ) : null}
        </div>
      ) : null}

      {access.status === "error" ? (
        <div className="rounded-2xl border border-rose-300/70 bg-rose-50/80 px-4 py-3 text-rose-900 shadow-sm backdrop-blur dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-50">
          Could not verify Twitch access. Try again in a moment.
        </div>
      ) : null}

      {access.status === "unauthenticated" ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200/70 bg-amber-50/85 px-5 py-4 text-amber-900 shadow-sm backdrop-blur dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-50">
          <div className="space-y-1">
            <p className="text-sm font-semibold">Authenticate with Twitch</p>
            <p className="text-xs opacity-80">
              We need permission to read your chatters before quests unlock. This matches the Wheel of Blame flow.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/api/twitch/login?redirect=%2Ftwitch%2Fstream-quest"
              className="rounded-full bg-amber-900/80 px-5 py-2 text-sm font-semibold text-amber-50 shadow-lg transition hover:bg-amber-800/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100"
            >
              Authenticate with Twitch
            </a>
            <button
              type="button"
              onClick={loadAccess}
              className="rounded-full border border-amber-200/80 bg-white/70 px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm transition hover:border-amber-300 hover:bg-amber-50 dark:border-amber-800/70 dark:bg-transparent dark:text-amber-50 dark:hover:border-amber-700 dark:hover:bg-amber-900/30"
            >
              Recheck
            </button>
          </div>
        </div>
      ) : null}

      {canShowQuests ? (
        <>
          {loading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
              <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
              Loading Stream Quest…
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-200/70 bg-rose-50 px-4 py-3 text-rose-900 shadow-sm dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-100">
              {error}
            </div>
          ) : null}

          {data ? (
            <>
              <div className="relative overflow-hidden rounded-[36px] shadow-[0_26px_60px_rgba(0,0,0,0.28)]">
                <div
  className="relative h-full w-full bg-center bg-no-repeat p-4 md:p-8 lg:p-12"
  style={{
    backgroundImage: tavernBoardBg,
    backgroundSize: "contain", // Changed from "cover" to "contain"
    backgroundPosition: "center top", // Aligns it to the top so headers stay inside
    minHeight: "800px" // Ensures there is enough vertical space for the board
  }}
>
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,0,0,0.2),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(0,0,0,0.35),transparent_40%)]" />
                  <div className="relative flex flex-wrap items-start gap-4 lg:items-center">
                    <div className="max-w-3xl space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-100/80 drop-shadow">
                        Daily Stream Quest
                      </p>
                      <h2 className="text-4xl font-semibold leading-none text-amber-50 drop-shadow">
                        Five quests. 500 Toadcoins each.
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm text-amber-50/80 drop-shadow">
                        Click COMPLETE once you finish a dare on stream. Each completion drops coins to the current
                        chatter list when you&apos;re live and connected.
                      </p>
                    </div>
                    <div className="ml-auto flex flex-col items-end gap-2 text-right sm:flex-row sm:items-center sm:gap-3">
                      <div className="flex items-center gap-2 rounded-full border border-amber-200/60 bg-amber-900/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100 shadow-sm backdrop-blur sm:order-2">
                        <Clock3 className="h-4 w-4" />
                        Resets daily
                      </div>
                      <div className="sm:order-1">
                        <AudienceBadge audience={data.audience} />
                      </div>
                    </div>
                  </div>

                  {!isLive ? (
                    <div className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-amber-900 shadow-inner backdrop-blur-sm dark:border-amber-900/70 dark:bg-amber-950/60 dark:text-amber-100">
                      <p className="text-sm font-semibold">
                        {streamerName ? `${streamerName} is not live right now.` : "Streamer is not live right now."}
                      </p>
                      <p className="text-xs opacity-80">Go live to unlock quests and start minting rewards.</p>
                    </div>
                  ) : null}

                  {isLive && !isAuthed ? (
                    <div className="mt-4 rounded-2xl border border-amber-900/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-50 shadow-inner">
                      Connect Twitch above to unlock quests for chatters while you&apos;re live.
                    </div>
                  ) : null}

                  <div className="relative mt-6 flex flex-wrap justify-center gap-4">
                  {data.quests.map((quest) => (
                    <div key={quest.id} className="w-full md:w-[calc(33.333%-1rem)] lg:max-w-[350px]">
                      <QuestTile
                        quest={quest}
                        onComplete={() => completeQuest(quest.id)}
                        completing={completingId === quest.id}
                        celebrating={celebratingId === quest.id}
                        inactive={!isLive || !isAuthed}
                      />
                    </div>
                  ))}
                </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <LedgerCard totalMinted={totalMinted} topHolders={topHolders} audience={data.audience} />
                </div>
                <div className="rounded-2xl border border-amber-200/70 bg-white/80 p-4 text-amber-900 shadow-sm dark:border-amber-900/70 dark:bg-slate-900/60 dark:text-amber-50">
                  <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-amber-800 dark:text-amber-100">
                    <Sparkles className="h-4 w-4" />
                    Rewards
                  </div>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                    Each quest drops <strong>500 Toadcoins</strong> to everyone watching in chat (or to the
                    standby roster when you&apos;re offline). Quests grey out after completion until the next
                    reset.
                  </p>
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-amber-900 shadow-inner dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                    <Coins className="h-5 w-5" />
                    <span className="text-sm font-semibold">
                      {totalMinted.toLocaleString()} toadcoins minted across chat.
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : null}
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
  inactive,
}: {
  quest: StreamQuest;
  onComplete: () => void;
  completing: boolean;
  celebrating: boolean;
  inactive: boolean;
}) {
  const meta = categoryMeta[quest.category];
  const Icon = meta.icon;
  const isCompleted = quest.completed;
  const isDisabled = quest.completed || completing;

  return (
    <button
      type="button"
      onClick={isDisabled ? undefined : onComplete}
      disabled={isDisabled}
      className={clsx(
        "group relative h-full overflow-hidden rounded-2xl border bg-white/90 text-left shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition duration-200 dark:border-amber-900/80 dark:bg-slate-950/80",
        isCompleted
          ? "cursor-not-allowed border-slate-300/80 text-slate-600 opacity-85 dark:border-slate-800/70 dark:text-slate-300"
          : "border-amber-200/70 hover:-translate-y-[6px] hover:shadow-[0_18px_40px_rgba(0,0,0,0.25)] active:translate-y-[1px]",
        !isCompleted && inactive && "opacity-95 saturate-90"
      )}
    >
      <div
        className={clsx(
          "absolute inset-0 z-0 bg-gradient-to-br opacity-70 transition duration-300",
          meta.accent,
          quest.completed ? "brightness-75" : "group-hover:opacity-100 group-hover:brightness-110"
        )}
      />
      <div
        className={clsx(
          "absolute inset-0 z-0 bg-black/40 transition duration-300 opacity-0 group-hover:opacity-20",
          isCompleted && "opacity-50"
        )}
      />

      {celebrating ? <CelebrationBurst /> : null}

      {!isCompleted ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="rotate-[-10deg] text-3xl font-black uppercase tracking-[0.35em] text-rose-500 opacity-0 drop-shadow-[0_0_16px_rgba(225,29,72,0.35)] transition duration-300 group-hover:-translate-y-1 group-hover:scale-[1.03] group-hover:opacity-100">
            COMPLETE
          </span>
        </div>
      ) : null}

      <div className={clsx("relative z-10 flex h-full flex-col gap-3 p-5", isCompleted && "opacity-80")}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 rounded-full border border-amber-300/70 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-900 shadow-sm dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-50">
            <Sparkles className="h-4 w-4" />
            Daily
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-amber-300/70 bg-white/80 px-3 py-1 text-sm font-semibold text-amber-900 shadow-sm dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-50">
            <Coins className="h-4 w-4" />
            500
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-white/50 bg-white/80 px-3 py-2 shadow-inner backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-900/70">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-amber-200/70 bg-gradient-to-br from-white to-amber-50 shadow-sm dark:border-amber-900/60 dark:from-slate-900 dark:to-amber-950/50">
            <Icon className="h-6 w-6 text-amber-800 dark:text-amber-200" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-amber-900 drop-shadow-sm dark:text-amber-50">
                {quest.title}
              </span>
              <span
                className={clsx(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em]",
                  meta.chip,
                  "dark:border-white/10 dark:bg-white/5 dark:text-white/80"
                )}
              >
                {meta.label}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{quest.prompt}</p>
          </div>
        </div>

        {isCompleted ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
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
          <h2 className="text-2xl font-semibold text-amber-900 dark:text-amber-50">Chat balance sheet</h2>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {audience.live
              ? "Live chat is connected. Rewards will mint straight to the current chatter list."
              : "Using placeholder chatters until Twitch auth is connected or the stream is live."}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-2 text-amber-900 shadow-inner dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <Coins className="h-5 w-5" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.25em]">Minted Today</div>
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
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-amber-900 dark:text-amber-50">{name}</span>
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
