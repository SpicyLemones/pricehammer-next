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

  // SCALING: Calculate font size based on number of segments.
  // Fewer segments = larger font (max 28px). More segments = smaller font (min 10px).
  const fontSize = Math.max(10, 28 - segments * 1.5);

  function spin() {
    if (!chatters.length || spinning) return;

    const winnerIndex = Math.floor(Math.random() * chatters.length);
    const spins = 6 + Math.floor(Math.random() * 3);
    
    // SYNC MATH:
    // 1. Calculate the angle where the winner starts (relative to 0/top)
    const winnerStartAngle = winnerIndex * segmentAngle + segmentAngle / 2;
    
    // 2. We want the winner to end up at 90 degrees (Right side).
    //    Current physical position of winner = (spinAngle + winnerStartAngle) % 360
    //    We need to add 'delta' such that: (current + delta) lands on 90.
    const currentTotalAngle = spinAngle + winnerStartAngle;
    const currentMod = currentTotalAngle % 360;
    
    // Calculate how far we are from 90 degrees
    let distanceToPointer = 90 - currentMod;
    if (distanceToPointer < 0) {
        distanceToPointer += 360;
    }
    
    // 3. Target = Add full spins + the specific distance needed to align
    const target = spinAngle + (spins * 360) + distanceToPointer;

    setSpinning(true);
    setSpinAngle(target);

    if (audioRef.current) {
      try {
        audioRef.current.currentTime = 0;
        void audioRef.current.play();
      } catch (err) {
        console.warn("Spin audio failed to play", err);
      }
    }

    setTimeout(() => {
      setSpinning(false);
      setResult({ winner: chatters[winnerIndex], angle: target });
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
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
                {/* Auth UI omitted for brevity, same as before */}
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
                  className="absolute inset-5 rounded-full bg-slate-950/80 transition-transform duration-[5000ms] ease-[cubic-bezier(0.25,0.1,0.2,1)] ring-8 ring-slate-800/70"
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
                        {/* The Color Slice */}
                        <div
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: `conic-gradient(${color} ${segmentAngle - 0.6}deg, transparent ${segmentAngle}deg)`,
                            maskImage: "radial-gradient(circle at center, transparent 30%, black 30%, black 100%)",
                          }}
                        />
                        
                        {/* The Text Label - Fixed Alignment */}
                        {label && (
                          <div
                            className="absolute left-1/2 top-1/2 flex items-center justify-end"
                            style={{
                              // 1. Point towards the wedge center
                              // 2. Move out to the middle of the radius (approx 120px)
                              transform: `rotate(${segmentAngle / 2}deg) translate(120px) `,
                              width: "220px", // Limit width to prevent overflow
                              transformOrigin: "left center", // Rotate from the center of the wheel
                              height: "0px", // Collapse height so it centers perfectly
                            }}
                          >
                            <span 
                                className="block truncate font-bold uppercase text-white drop-shadow-md"
                                style={{ fontSize: `${fontSize}px` }}
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

            {/* Results UI */}
            <div className="mx-auto flex max-w-3xl flex-col gap-4 text-center">
              <div className="w-full rounded-3xl border border-slate-200 bg-white/80 p-5 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Recent winner</h3>
                  {result ? (
                    <div className="mt-3 text-2xl font-bold text-rose-500">
                      🎉 {result.winner}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No spins yet.</p>
                  )}
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