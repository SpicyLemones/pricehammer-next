"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, PartyPopper, Sparkles } from "lucide-react";

type OverlayTarget = {
  id: string;
  name: string;
  level: number;
  color: string;
  flair: string;
  xpToNext: number;
};

type Toast = {
  id: string;
  name: string;
  newLevel: number;
  flair: string;
  color: string;
};

const OVERLAY_COOLDOWN_MS = 60_000;

function createToast(target: OverlayTarget): Toast {
  return {
    id: `${target.id}-${Date.now()}`,
    name: target.name,
    flair: target.flair,
    color: target.color,
    newLevel: target.level + 1,
  };
}

type ConnectionState = "connecting" | "open" | "closed" | "error";

export function OverlayClient({ streamerId }: { streamerId: string }) {
  const [queue, setQueue] = useState<OverlayTarget[]>([]);
  const [active, setActive] = useState<OverlayTarget | null>(null);
  const [xpFill, setXpFill] = useState(0.7);
  const [celebration, setCelebration] = useState<OverlayTarget | null>(null);
  const [, setCooldowns] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  const reconnectAttempts = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<OverlayTarget | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlBg = html.style.backgroundColor;
    const previousBodyBg = body.style.backgroundColor;
    const previousBodyImage = body.style.backgroundImage;

    html.style.backgroundColor = "transparent";
    body.style.backgroundColor = "transparent";
    body.style.backgroundImage = "none";

    return () => {
      html.style.backgroundColor = previousHtmlBg;
      body.style.backgroundColor = previousBodyBg;
      body.style.backgroundImage = previousBodyImage;
    };
  }, []);

  useEffect(() => {
    if (!active && queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      setActive(next);
      const startingFill = Math.max(0.58, 1 - next.xpToNext / 140);
      setXpFill(startingFill);
    }
  }, [active, queue]);

  useEffect(() => {
    if (!active) return;

    const ramp = requestAnimationFrame(() => setXpFill(1));

    const celebrationTimer = window.setTimeout(() => {
      setCelebration(active);
      setToasts((prev) => [...prev, createToast(active)]);
      setCooldowns((prev) => ({ ...prev, [active.id]: Date.now() + OVERLAY_COOLDOWN_MS }));
    }, 5200);

    const cleanupTimer = window.setTimeout(() => {
      setCelebration(null);
      setActive(null);
      setXpFill(0.7);
    }, 9200);

    return () => {
      cancelAnimationFrame(ramp);
      window.clearTimeout(celebrationTimer);
      window.clearTimeout(cleanupTimer);
    };
  }, [active]);

  useEffect(() => {
    const baseUrl = window.location.origin;
    const token = new URLSearchParams(window.location.search).get("token");
    const url = new URL(`/api/twitch/overlay/events/${encodeURIComponent(streamerId)}`, baseUrl);
    if (token) url.searchParams.set("token", token);

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      const source = new EventSource(url.toString());
      eventSourceRef.current = source;
      setConnectionState("connecting");
      setLastError(null);

      source.onopen = () => {
        reconnectAttempts.current = 0;
        setConnectionState("open");
        setLastError(null);
      };

      source.onerror = (event) => {
        console.error("overlay sse error", event);
        setConnectionState("error");
        setLastError("Connection lost, retrying…");
        source.close();

        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        const attempt = reconnectAttempts.current + 1;
        reconnectAttempts.current = attempt;
        const backoff = Math.min(15_000, 1000 * 2 ** Math.min(4, attempt));
        reconnectTimerRef.current = setTimeout(connect, backoff);
      };

      source.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data ?? "{}");
          if (parsed?.type === "level-up" && parsed.payload) {
            const payload: OverlayTarget = parsed.payload;
            const now = Date.now();

            setCooldowns((prev) => {
              if ((prev[payload.id] ?? 0) > now) return prev;

              setQueue((queuePrev) => {
                if (queuePrev.some((item) => item.id === payload.id)) return queuePrev;
                if (activeRef.current?.id === payload.id) return queuePrev;
                return [...queuePrev, payload];
              });

              return { ...prev, [payload.id]: now + OVERLAY_COOLDOWN_MS };
            });
          }
        } catch (error) {
          console.error("Failed to parse overlay event", error);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [streamerId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setCooldowns((prev) => {
        const next = { ...prev };
        Object.entries(next).forEach(([id, until]) => {
          if (until < now) delete next[id];
        });
        return next;
      });
    }, 5_000);

    return () => window.clearInterval(timer);
  }, []);

  const remainingXp = active ? Math.max(0, Math.round(active.xpToNext * (1 - xpFill))) : 0;

  return (
    <div className="relative min-h-dvh w-full overflow-hidden font-ui text-white">
      <Atmosphere />

      <div className="pointer-events-none fixed left-6 top-6 z-30 flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100 shadow-lg backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
          Overlay {connectionState === "open" ? "Live" : connectionState === "connecting" ? "Connecting" : "Offline"}
          <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase text-amber-100 shadow-inner shadow-amber-500/20 backdrop-blur-sm">
            twitch/overlay
          </span>
        </div>

        <div className="pointer-events-auto w-80 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm shadow-lg backdrop-blur">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-200/80">Incoming queue</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {queue.map((entry) => (
              <span
                key={entry.id}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/90 shadow-inner"
              >
                <span className="h-2 w-2 rounded-full bg-white/70" />
                {entry.name}
                <span className="text-white/60">Lvl {entry.level}</span>
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-100/70">
            Only one runner is spotlighted at a time. Cooldown {Math.round(OVERLAY_COOLDOWN_MS / 1000)}s before repeat.
          </p>
          {lastError && (
            <p className="mt-2 rounded-lg border border-amber-300/30 bg-amber-100/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100">
              {lastError}
            </p>
          )}
        </div>
      </div>

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((toast) => toast.id !== id))} />

      {active && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mb-6 flex items-end justify-center px-4">
          <div className="w-full max-w-5xl translate-y-6 animate-overlay-bar">
            <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-t from-black/70 via-black/40 to-white/5 p-4 shadow-[0_10px_120px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
              <div className="absolute inset-0 bg-gradient-to-r from-white/8 via-white/0 to-white/8 opacity-80" />
              <div className="relative flex items-center gap-4">
                <div
                  aria-hidden
                  className={`h-16 w-16 shrink-0 rounded-2xl border border-white/20 bg-gradient-to-br ${active.color} shadow-lg shadow-black/40`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <p className="text-lg font-bold tracking-[0.08em] uppercase text-white drop-shadow">
                      {active.name}
                    </p>
                    <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
                      {active.flair}
                    </span>
                    <span className="ml-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase text-emerald-100">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                      Focus locked
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="relative h-6 flex-1 overflow-hidden rounded-full border border-white/15 bg-white/10 shadow-inner">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-300 via-lime-200 to-amber-200 transition-[width] duration-[5s] ease-out"
                        style={{ width: `${Math.min(1, xpFill) * 100}%` }}
                      />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(255,255,255,0.25),transparent_35%)] opacity-70 mix-blend-screen" />
                    </div>
                    <div className="flex flex-col items-end">
                      <p className="text-xs uppercase tracking-[0.14em] text-white/70">xp to next</p>
                      <p className="text-sm font-semibold text-white">{remainingXp} xp</p>
                    </div>
                  </div>

                  <p className="mt-2 text-[13px] uppercase tracking-[0.18em] text-white/60">
                    Charging level {active.level + 1} — stay put until it pops.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {celebration && (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
          <CelebrationBurst target={celebration} />
        </div>
      )}

      <div className="pointer-events-auto fixed right-6 bottom-6 z-30 max-w-sm rounded-2xl border border-white/10 bg-black/60 p-4 text-sm text-slate-100 shadow-xl backdrop-blur">
        <p className="text-xs uppercase tracking-[0.2em] text-white/70">What&apos;s planned next</p>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-50/90">
          <li>Toadcoin spends to drop images or trigger effects.</li>
          <li>Queue controls from chat + broadcaster dashboard.</li>
          <li>Websocket feed for real live leveling data.</li>
        </ul>
        <div className="mt-3 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100">
          <Sparkles size={14} /> Open ended on purpose — just drop it into OBS.
        </div>
      </div>

      <style jsx global>{`
        @keyframes overlayToast {
          0% {
            transform: translateY(-14px) scale(0.94);
            opacity: 0;
            filter: blur(2px);
          }
          12% {
            transform: translateY(0) scale(1);
            opacity: 1;
            filter: blur(0);
          }
          82% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(-12px) scale(0.98);
            opacity: 0;
            filter: blur(3px);
          }
        }

        @keyframes overlayBar {
          0% {
            transform: translateY(22px);
            opacity: 0;
          }
          35% {
            transform: translateY(0);
            opacity: 1;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes overlayPulse {
          0% {
            transform: scale(0.8);
            opacity: 0.2;
          }
          50% {
            transform: scale(1.02);
            opacity: 0.6;
          }
          100% {
            transform: scale(0.85);
            opacity: 0.2;
          }
        }

        .animate-overlay-toast {
          animation: overlayToast 5.4s ease-in-out forwards;
        }

        .animate-overlay-bar {
          animation: overlayBar 0.9s ease-out forwards;
        }

        .animate-overlay-pulse {
          animation: overlayPulse 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timers = toasts.map((toast) => window.setTimeout(() => onDismiss(toast.id), 5200));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [onDismiss, toasts]);

  return (
    <div className="pointer-events-none fixed right-6 top-6 z-40 flex w-full max-w-xs flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-overlay-toast overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-br ${toast.color} p-[1px] shadow-lg shadow-black/50`}
        >
          <div className="relative rounded-[1rem] bg-black/70 p-4 backdrop-blur">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.2),transparent_35%)] opacity-70" />
            <div className="relative flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-black/40 p-2 text-amber-200 shadow-inner shadow-amber-400/30">
                <PartyPopper size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.1em] text-white">
                  {toast.name} reached level {toast.newLevel}
                </p>
                <p className="text-xs uppercase tracking-[0.18em] text-white/70">{toast.flair}</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CelebrationBurst({ target }: { target: OverlayTarget }) {
  return (
    <div className="relative flex flex-col items-center justify-center gap-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.16),transparent_45%)] blur-3xl" />
      <div className={`animate-overlay-pulse absolute h-56 w-56 rounded-full bg-gradient-to-br ${target.color} blur-3xl`} />

      <div className="relative flex items-center gap-3 rounded-[32px] border border-white/15 bg-white/10 px-6 py-3 text-sm uppercase tracking-[0.16em] text-white backdrop-blur">
        <Sparkles size={18} className="text-amber-200" />
        Leveling complete
        <ArrowUp size={18} className="text-emerald-200" />
      </div>

      <div className="relative flex items-center gap-4 rounded-[40px] border border-white/20 bg-gradient-to-br from-black/70 via-black/40 to-white/5 px-10 py-6 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg">
        <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${target.color} shadow-inner shadow-black/40`} />
        <div className="min-w-0">
          <p className="text-sm uppercase tracking-[0.14em] text-white/70">Welcome to</p>
          <p className="text-3xl font-bold uppercase tracking-[0.08em] text-white drop-shadow">
            Level {target.level + 1}
          </p>
          <p className="text-sm uppercase tracking-[0.14em] text-white/80">{target.name}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-100">
          <PartyPopper size={16} />
          Cooldown armed
        </div>
      </div>
    </div>
  );
}

function Atmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.08),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(56,189,248,0.12),transparent_35%),radial-gradient(circle_at_70%_70%,rgba(236,72,153,0.12),transparent_38%)]" />
      <div className="absolute -left-10 top-10 h-64 w-64 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="absolute right-0 bottom-0 h-72 w-72 rounded-full bg-fuchsia-400/15 blur-3xl" />
      <div className="absolute left-1/2 top-0 h-56 w-[120%] -translate-x-1/2 bg-gradient-to-b from-white/10 via-white/5 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/40 via-black/0 to-transparent" />
    </div>
  );
}
