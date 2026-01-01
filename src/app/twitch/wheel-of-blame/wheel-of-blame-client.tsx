"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type ChattersState =
  | { status: "idle" | "loading" }
  | { status: "unauthenticated" }
  | { status: "misconfigured"; missing: string[] }
  | { status: "offline"; displayName?: string }
  | { status: "ready"; displayName?: string; chatters: string[] };

type SpinResult = { winner: string; angle: number };

const fallbackColors = ["#FFD166", "#EF476F", "#06D6A0", "#118AB2", "#A556F6", "#F78C6B", "#4CC9F0", "#BDE0FE"];

function useChatters() {
  const [state, setState] = useState<ChattersState>({ status: "idle" });

  async function load() {
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
    const id = setInterval(load, 350_000);
    return () => clearInterval(id);
  }, []);

  return { state, reload: load };
}

export default function WheelOfBlameClient() {
  const { state, reload } = useChatters();
  const [spinAngle, setSpinAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio("/audio/spin.mp3");
    audioRef.current.preload = "auto";
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const chatters = useMemo(() => (state.status === "ready" ? state.chatters : []), [state]);
  const segments = Math.max(chatters.length, 1);
  const segmentAngle = 360 / segments;

  const colors = useMemo(() => chatters.map((_, idx) => fallbackColors[idx % fallbackColors.length]), [chatters]);

  // SCALING: Font size based on chatter count (fewer people = bigger text)
  const fontSize = Math.max(12, 28 - segments * 0.8);

  function spin() {
      if (!chatters.length || spinning) return;

      // Pick the winner
      const winnerIndex = Math.floor(Math.random() * chatters.length);
      const spins = 8 + Math.floor(Math.random() * 4); // Extra spins for drama
      
      // SYNC MATH:
      // 1. Where is the winner starting?
      const winnerStartAngle = (winnerIndex * segmentAngle) + (segmentAngle / 2);
      
      // 2. Adjust for the 90 degree (Right Side) offset.
      // In CSS, 0deg is Top. To make winnerStartAngle land at 90deg, 
      // we need to rotate the wheel by (90 - winnerStartAngle).
      const currentMod = spinAngle % 360;
      let adjustment = (90 - winnerStartAngle) - currentMod;
      
      // Ensure we always spin forward
      if (adjustment <= 0) adjustment += 360;
      
      const target = spinAngle + (spins * 360) + adjustment;

      setSpinning(true);
      setSpinAngle(target);

      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }

      setTimeout(() => {
        setSpinning(false);
        setResult({ winner: chatters[winnerIndex], angle: target });
      }, 5200);
    }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <video
        ref={videoRef}
        className="pointer-events-none fixed inset-0 h-full w-full object-cover blur-md"
        src="/videos/wheelofblame.mp4"
        autoPlay
        loop
        muted={!soundEnabled}
        playsInline
        onCanPlay={() => {
          const el = videoRef.current;
          if (!el) return;
          const playPromise = el.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {
              el.muted = true;
              setSoundEnabled(false);
            });
          }
        }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-black/70 via-black/65 to-black/80" aria-hidden />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 p-6">
        <a
          href="/twitch"
          className="fixed left-4 top-4 z-50 rounded-full bg-slate-900/80 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:bg-slate-800/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          ← Back to spycy.fun/twitch
        </a>
        <button
          type="button"
          onClick={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            if (videoRef.current) {
              videoRef.current.muted = !next;
              if (next) {
                const playPromise = videoRef.current.play();
                if (playPromise && typeof playPromise.catch === "function") {
                  playPromise.catch(() => {
                    videoRef.current?.pause();
                    videoRef.current!.muted = true;
                    setSoundEnabled(false);
                  });
                }
              }
            }
          }}
          className="fixed left-4 top-16 z-50 rounded-full bg-rose-600/80 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:bg-rose-500/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {soundEnabled ? "Mute flames" : "Enable flames audio"}
        </button>
        <style jsx global>{`
          @font-face {
            font-family: "Red Devil";
            src: url("/fonts/Red_Devil.otf") format("opentype");
            font-display: swap;
          }
          .font-red-devil {
            font-family: "Red Devil", var(--font-sans, "Inter"), system-ui, -apple-system, sans-serif;
          }
        `}</style>
        <header className="space-y-2 text-center">
          <h1 className="font-red-devil text-5xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
            Wheel of Blame
          </h1>
          <p className="text-base text-slate-600 dark:text-slate-300">
            Blame a loyal chatter for whatever went wrong this time, and punish or redeem them.
          </p>
        </header>

        {state.status === "unauthenticated" && (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Connect Twitch</h2>
                <div className="mt-4">
                     <a href="/api/twitch/login" className="rounded-full bg-purple-600 px-5 py-3 text-sm font-semibold text-white">Connect</a>
                </div>
            </div>
        )}

        {state.status === "ready" && (
          <div className="space-y-8">
            <div className="relative mx-auto flex h-[620px] w-full max-w-5xl items-center justify-center">
              {/* Wheel Container */}
              <div className="relative h-[480px] w-[480px] rounded-full bg-slate-950/70 shadow-[0_20px_70px_rgba(0,0,0,0.55)] ring-[14px] ring-slate-900/70">
                
                {/* Pointer (Demon) */}
                <div className="absolute right-[-130px] top-1/2 z-30 -translate-y-1/2 rotate-6">
                  <div className="relative h-48 w-48">
                    <Image src="/images/wheel-pointer.png" alt="Pointer" fill className="object-contain" priority />
                  </div>
                </div>

                {/* The Rotating Wheel */}
                <div
                  className="absolute inset-5 rounded-full bg-slate-950/80 transition-transform duration-[5000ms] ease-[cubic-bezier(0.15,0,0.15,1)] ring-8 ring-slate-800/70"
                  style={{ transform: `rotate(${spinAngle}deg)` }}
                >
                  {Array.from({ length: segments }).map((_, idx) => {
                    const rotate = idx * segmentAngle;
                    const label = chatters[idx] ?? "";
                    const color = colors[idx % colors.length];
                    return (
                      <div key={idx} className="absolute inset-0 origin-center" style={{ transform: `rotate(${rotate}deg)` }}>
                        {/* Slice Color */}
                        <div
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: `conic-gradient(from -90deg, ${color} ${segmentAngle - 0.4}deg, transparent ${segmentAngle}deg)`,
                            maskImage: "radial-gradient(circle at center, transparent 30%, black 30%, black 100%)",
                          }}
                        />
                        
                        {/* Label - Fixed alignment and visibility */}
                        {label && (
                          <div
                            className="absolute left-1/2 top-1/2 z-10 flex items-center justify-end"
                            style={{
                              // The center of the slice is segmentAngle / 2
                              // We don't need the -90 here because the parent div is already rotated
                              transform: `rotate(${segmentAngle / 2}deg)`,
                              width: "210px", // Length from center to rim
                              transformOrigin: "left center",
                              height: "20px", // Give it some height for better centering
                              marginTop: "-10px", // Offset by half the height to center vertically
                            }}
                          >
                            <span 
                              className="block truncate font-bold uppercase text-white"
                              style={{ 
                                fontSize: `${fontSize}px`,
                                textShadow: "2px 2px 4px rgba(0,0,0,0.9)", // Makes text pop
                                paddingRight: "15px" // Space from the edge
                              }}
                            >
                              {label}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Center Button */}
                <button
                  type="button"
                  onClick={spin}
                  disabled={spinning || !chatters.length}
                  className="font-red-devil absolute left-1/2 top-1/2 z-20 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-b from-rose-500 to-rose-600 text-2xl font-black uppercase tracking-[0.2em] text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)] transition hover:scale-105 active:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Blame
                </button>
              </div>
            </div>

            {/* Results & Chatter List (RESTORED) */}
            <div className="mx-auto flex max-w-3xl flex-col gap-4 text-center">
              <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-center">
                
                {/* Roll Log */}
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

                {/* Chatter List */}
                <div className="w-full max-w-sm space-y-2 rounded-3xl border border-slate-200 bg-white/80 p-5 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    {chatters.length} Chatters
                  </p>
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
    </div>
  );
}