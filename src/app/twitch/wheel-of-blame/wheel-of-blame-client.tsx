\"use client\";

import Image from \"next/image\";
import { useEffect, useMemo, useRef, useState } from \"react\";

type ChattersState =
  | { status: \"idle\" | \"loading\" }
  | { status: \"unauthenticated\" }
  | { status: \"misconfigured\"; missing: string[] }
  | { status: \"offline\"; displayName?: string }
  | { status: \"ready\"; displayName?: string; chatters: string[] };

type SpinResult = { winner: string; angle: number };

const fallbackColors = [
  \"#FFD166\",
  \"#EF476F\",
  \"#06D6A0\",
  \"#118AB2\",
  \"#A556F6\",
  \"#F78C6B\",
  \"#4CC9F0\",
  \"#BDE0FE\",
];

function useChatters() {
  const [state, setState] = useState<ChattersState>({ status: \"idle\" });

  async function load() {
    try {
      const configRes = await fetch(\"/api/twitch/status\");
      const config = (await configRes.json()) as { configured?: boolean; missing?: string[] };
      if (!config.configured) {
        setState({ status: \"misconfigured\", missing: config.missing ?? [] });
        return;
      }
    } catch (error) {
      console.error(\"Failed to check Twitch configuration\", error);
      setState({ status: \"misconfigured\", missing: [] });
      return;
    }

    setState({ status: \"loading\" });
    try {
      const res = await fetch(\"/api/twitch/chatters\");
      if (res.status === 401) {
        setState({ status: \"unauthenticated\" });
        return;
      }
      const data = (await res.json()) as { live: boolean; chatters?: string[]; displayName?: string };
      if (!data.live) {
        setState({ status: \"offline\", displayName: data.displayName });
        return;
      }
      setState({ status: \"ready\", displayName: data.displayName, chatters: data.chatters ?? [] });
    } catch (error) {
      console.error(\"Failed to load chatters\", error);
      setState({ status: \"unauthenticated\" });
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(\"/audio/spin.mp3\");
    audioRef.current.preload = \"auto\";
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const chatters = useMemo(() => (state.status === \"ready\" ? state.chatters : []), [state]);
  const segments = Math.max(chatters.length, 1);
  const segmentAngle = 360 / segments;

  const colors = useMemo(() => chatters.map((_, idx) => fallbackColors[idx % fallbackColors.length]), [chatters]);

  function spin() {
    if (!chatters.length || spinning) return;
    const winnerIndex = Math.floor(Math.random() * chatters.length);
    const spins = 6 + Math.floor(Math.random() * 3);
    const target = spins * 360 + winnerIndex * segmentAngle + segmentAngle / 2;
    setSpinning(true);
    setSpinAngle((prev) => prev + target);
    if (audioRef.current) {
      try {
        audioRef.current.currentTime = 0;
        void audioRef.current.play();
      } catch (err) {
        console.warn(\"Spin audio failed to play\", err);
      }
    }

    setTimeout(() => {
      setSpinning(false);
      setResult({ winner: chatters[winnerIndex], angle: target });
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }, 4200);
  }

  return (
    <div className=\"space-y-8\">
      <style jsx global>{`
        @font-face {
          font-family: \"Red Devil\";
          src: url(\"/fonts/Red_Devil.otf\") format(\"opentype\");
          font-display: swap;
        }
        .font-red-devil {
          font-family: \"Red Devil\", var(--font-sans, \"Inter\"), system-ui, -apple-system, sans-serif;
        }
      `}</style>
      <header className=\"space-y-2 text-center\">
        <h1 className=\"font-red-devil text-5xl font-black uppercase tracking-tight text-slate-900 dark:text-white\">
          Wheel of Blame
        </h1>
        <p className=\"text-base text-slate-600 dark:text-slate-300\">
          Blame a loyal chatter for whatever went wrong this time, and punish or redeem them.
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
        <div className="space-y-8">
          <div className="relative mx-auto flex h-[480px] w-full max-w-3xl items-center justify-center">
            <div className="relative h-[360px] w-[360px] rounded-full bg-slate-900/70 shadow-2xl ring-8 ring-slate-900/60">
              <div className="absolute left-[-70px] top-1/2 z-30 -translate-y-1/2">
                <div className="relative h-32 w-32">
                  <Image src="/images/wheel-pointer.png" alt="Pointer" fill className="object-contain" priority />
                </div>
              </div>

              <div
                className="absolute inset-0 rounded-full transition-transform duration-[4200ms] ease-[cubic-bezier(0.25,0.1,0.2,1)]"
                style={{
                  transform: `rotate(${spinAngle}deg)`,
                }}
              >
                {Array.from({ length: segments }).map((_, idx) => {
                  const rotate = idx * segmentAngle;
                  const label = chatters[idx] ?? "";
                  const color = colors[idx % colors.length];
                  return (
                    <div key={idx} className="absolute inset-0 origin-center" style={{ transform: `rotate(${rotate}deg)` }}>
                      <div
                        className="absolute inset-0"
                        style={{
                          background: `conic-gradient(${color} ${segmentAngle - 0.5}deg, transparent ${segmentAngle}deg)`,
                          maskImage:
                            "radial-gradient(circle at center, transparent 36%, black 36%, black 100%)",
                        }}
                      />
                      {label && (
                        <div
                          className="absolute left-1/2 top-1/2 origin-center -translate-x-1/2 -translate-y-1/2 text-center text-[13px] font-semibold uppercase tracking-[0.16em] text-white drop-shadow"
                          style={{
                            transform: `rotate(${segmentAngle / 2}deg) translateY(-38%) rotate(-${segmentAngle / 2}deg)`,
                            width: "60%",
                            lineHeight: "1.2",
                          }}
                        >
                          {label}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={spin}
                disabled={spinning || !chatters.length}
                className="font-red-devil absolute left-1/2 top-1/2 z-20 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-b from-rose-500 to-rose-600 text-xl font-black uppercase tracking-[0.2em] text-white shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition hover:scale-105 active:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Blame
              </button>
            </div>
          </div>

          <div className="mx-auto flex max-w-3xl flex-col gap-4 text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
              {chatters.length} chatters loaded
            </p>
            <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-center">
              <div className="w-full max-w-sm space-y-2 rounded-3xl border border-slate-200 bg-white/80 p-5 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
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
              <div className="w-full max-w-sm space-y-2 rounded-3xl border border-slate-200 bg-white/80 p-5 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
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
            </div>

            <button
              type="button"
              onClick={reload}
              className="mx-auto mt-2 w-fit rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            >
              Refresh chatters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
