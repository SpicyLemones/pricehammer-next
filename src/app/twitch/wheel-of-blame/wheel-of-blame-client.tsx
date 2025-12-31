"use client";

import { useEffect, useMemo, useState } from "react";

type ChattersState =
  | { status: "idle" | "loading" }
  | { status: "unauthenticated" }
  | { status: "misconfigured"; missing: string[] }
  | { status: "offline"; displayName?: string }
  | { status: "ready"; displayName?: string; chatters: string[] };

type SpinResult = { winner: string; angle: number };

function useChatters() {
  const [state, setState] = useState<ChattersState>({ status: "idle" });

  async function load() {
    // First check configuration so we can show a helpful message instead of a hard error.
    try {
      const configRes = await fetch("/api/twitch/status");
      const config = (await configRes.json()) as { configured?: boolean; missing?: string[] };
      if (!config.configured) {
        setState({ status: "misconfigured", missing: config.missing ?? [] });
        return;
      }
    } catch (error) {
      console.error("Failed to check Twitch configuration", error);
      setState({ status: "misconfigured", missing: [] });
      return;
    }

    setState({ status: "loading" });
    try {
      const res = await fetch("/api/twitch/chatters");
      if (res.status === 401) {
        setState({ status: "unauthenticated" });
        return;
      }
      const data = (await res.json()) as { live: boolean; chatters?: string[]; displayName?: string };
      if (!data.live) {
        setState({ status: "offline", displayName: data.displayName });
        return;
      }
      setState({ status: "ready", displayName: data.displayName, chatters: data.chatters ?? [] });
    } catch (error) {
      console.error("Failed to load chatters", error);
      setState({ status: "unauthenticated" });
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 45_000);
    return () => clearInterval(id);
  }, []);

  return { state, reload: load };
}

export default function WheelOfBlameClient() {
  const { state, reload } = useChatters();
  const [spinAngle, setSpinAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);

  const chatters = useMemo(() => (state.status === "ready" ? state.chatters : []), [state]);
  const segments = Math.max(chatters.length, 1);
  const segmentAngle = 360 / segments;

  const colors = useMemo(
    () =>
      chatters.map((_, idx) =>
        idx % 2 === 0 ? "from-amber-200 to-amber-300" : "from-indigo-200 to-indigo-300"
      ),
    [chatters]
  );

  function spin() {
    if (!chatters.length || spinning) return;
    const winnerIndex = Math.floor(Math.random() * chatters.length);
    const spins = 6 + Math.floor(Math.random() * 3);
    const target = spins * 360 + winnerIndex * segmentAngle + segmentAngle / 2;
    setSpinning(true);
    setSpinAngle((prev) => prev + target);

    setTimeout(() => {
      setSpinning(false);
      setResult({ winner: chatters[winnerIndex], angle: target });
    }, 4200);
  }

  const pointer = (
    <div className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">
      <span className="h-3 w-3 rotate-180 border-l-8 border-r-8 border-b-[14px] border-l-transparent border-r-transparent border-b-orange-500" />
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">Wheel of Blame</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Connect Twitch, pull your live chatters, and spin to pick the next brave soul.
        </p>
      </header>

      {state.status === "unauthenticated" && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Connect Twitch</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            We&apos;ll ask Twitch for permission to read your chatters (chat:read + moderator:read:chatters). We
            never store your client secret in the browser.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href="/api/twitch/login"
              className="rounded-full bg-purple-600 px-5 py-3 text-sm font-semibold text-white shadow transition hover:bg-purple-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
            >
              Connect Twitch
            </a>
            <button
              type="button"
              onClick={reload}
              className="rounded-full border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {state.status === "misconfigured" && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
          <h2 className="text-xl font-semibold">Twitch config missing</h2>
          <p className="text-sm mt-2">
            Add the required environment variables, restart the app, then retry:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            <li>TWITCH_CLIENT_ID</li>
            <li>TWITCH_CLIENT_SECRET</li>
            <li>TWITCH_REDIRECT_URI</li>
            <li>TWITCH_STATE_SECRET</li>
          </ul>
          {state.missing.length > 0 && (
            <p className="mt-3 text-xs text-rose-700 dark:text-rose-200">
              Detected missing: {state.missing.join(", ")}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={reload}
              className="rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-800 dark:bg-transparent dark:text-rose-100 dark:hover:border-rose-700 dark:hover:bg-rose-900/40"
            >
              Recheck
            </button>
          </div>
        </div>
      )}

      {state.status === "offline" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-semibold">
            {state.displayName ? `${state.displayName} is currently offline.` : "Stream is offline."}
          </p>
          <p className="text-sm">Go live to load chatters, then refresh.</p>
        </div>
      )}

      {state.status === "loading" && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-sm text-slate-600 dark:text-slate-300">Loading chatters...</p>
        </div>
      )}

      {state.status === "ready" && (
        <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-lg dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Live</p>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                  {state.displayName ?? "Your channel"}
                </h2>
              </div>
              <button
                type="button"
                onClick={reload}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
              >
                Refresh chatters
              </button>
            </div>

            <div className="relative mt-8 flex h-[360px] items-center justify-center">
              {pointer}
              <div
                className="relative flex h-72 w-72 items-center justify-center rounded-full border-[10px] border-white bg-gradient-to-b from-slate-100 to-slate-200 shadow-2xl dark:border-slate-900 dark:from-slate-800 dark:to-slate-900"
                style={{
                  transform: `rotate(${spinAngle}deg)`,
                  transition: spinning ? "transform 4s cubic-bezier(0.25, 0.1, 0.2, 1)" : "none",
                }}
              >
                {Array.from({ length: segments }).map((_, idx) => {
                  const rotate = idx * segmentAngle;
                  const label = chatters[idx] ?? "Spin me";
                  return (
                    <div
                      key={idx}
                      className="absolute inset-0 origin-center"
                      style={{ transform: `rotate(${rotate}deg)` }}
                    >
                      <div
                        className={`absolute left-1/2 top-0 h-1/2 w-1/2 -translate-x-1/2 rounded-bl-full rounded-br-full bg-gradient-to-br ${colors[idx % colors.length] ?? "from-slate-200 to-slate-300"} opacity-90`}
                        style={{ transform: `rotate(${segmentAngle / 2}deg)` }}
                      />
                      <div
                        className="absolute left-1/2 top-[22%] w-1/2 -translate-x-1/2 origin-top -rotate-90 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-100"
                        style={{ transform: `rotate(${segmentAngle / 2}deg)` }}
                      >
                        {label}
                      </div>
                    </div>
                  );
                })}
                <div className="absolute h-16 w-16 rounded-full bg-white shadow-inner dark:bg-slate-950" />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={spin}
                disabled={spinning || !chatters.length}
                className="rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300 dark:disabled:bg-indigo-500/60"
              >
                {spinning ? "Spinning..." : "Spin the wheel"}
              </button>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                {chatters.length} chatters loaded
              </span>
            </div>
          </div>

          <aside className="space-y-4 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Roll log</p>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Recent winner</h3>
              {result ? (
                <div className="mt-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-green-800 shadow-sm dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-100">
                  🎉 {result.winner}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No spins yet.</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Chatters</p>
              <div className="max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm shadow-inner dark:border-slate-800 dark:bg-slate-900/50">
                {chatters.length ? (
                  <ul className="space-y-1 text-slate-700 dark:text-slate-200">
                    {chatters.map((name) => (
                      <li key={name} className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold dark:bg-slate-800">
                        {name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">No chatters pulled yet.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
