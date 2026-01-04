"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ChattersState =
  | { status: "idle" | "loading" }
  | { status: "unauthenticated" }
  | { status: "misconfigured"; missing: string[] }
  | { status: "offline"; displayName?: string }
  | { status: "ready"; displayName?: string; chatters: string[] };

type SpinResult = { winner: string; angle: number };
type ActionChoice = "timeout" | "ban" | "forgive" | "doubleDown";
type PunishmentTone = "punish" | "saved";

const fallbackColors = ["#FFD166", "#EF476F", "#06D6A0", "#118AB2", "#A556F6", "#F78C6B", "#4CC9F0", "#BDE0FE"];
const defaultDoubleDownOptions = [
  "8 hour time out",
  "8 billion seconds time out",
  "Write an apology paragraph in chat",
  "3 year discord ban",
  "Donate 1 sub",
  "Donate 10 gifted sub",
  "Lose half your toadcoins",
  "Lose all your toadcoins",
  "SAVED",
];

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
  const [buttonHovered, setButtonHovered] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [activeAction, setActiveAction] = useState<ActionChoice | null>(null);
  const [revealStage, setRevealStage] = useState<"idle" | "prelude" | "winner">("idle");
  const [actionsVisible, setActionsVisible] = useState(false);
  const [punishmentPhase, setPunishmentPhase] = useState<"idle" | "intro" | "reveal">("idle");
  const [punishmentText, setPunishmentText] = useState<string | null>(null);
  const [punishmentTone, setPunishmentTone] = useState<PunishmentTone>("punish");
  const [winnerAnimationKey, setWinnerAnimationKey] = useState(0);
  const [doubleDownOptions, setDoubleDownOptions] = useState<string[]>(defaultDoubleDownOptions);
  const [doubleDownError, setDoubleDownError] = useState<string | null>(null);
  const [doubleDownSpinning, setDoubleDownSpinning] = useState(false);
  const [doubleDownReady, setDoubleDownReady] = useState(false);
  const [doubleDownLoading, setDoubleDownLoading] = useState(false);
  const [doubleDownActiveIndex, setDoubleDownActiveIndex] = useState(0);
  const [showDoubleDownHighlight, setShowDoubleDownHighlight] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const demonOverlayRef = useRef<HTMLVideoElement | null>(null);
  const demonButtonRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const punishAudioRef = useRef<HTMLAudioElement | null>(null);
  const savedAudioRef = useRef<HTMLAudioElement | null>(null);
  const wilhelmAudioRef = useRef<HTMLAudioElement | null>(null);
  const punishmentTimerRef = useRef<NodeJS.Timeout | null>(null);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const actionsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const doubleDownLoopTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    audioRef.current = new Audio("/audio/spin.mp3");
    audioRef.current.preload = "auto";
    punishAudioRef.current = new Audio("/audio/punish.mp3");
    punishAudioRef.current.preload = "auto";
    if (punishAudioRef.current) punishAudioRef.current.volume = 0.3;
    savedAudioRef.current = new Audio("/audio/saved.mp3");
    savedAudioRef.current.preload = "auto";
    if (savedAudioRef.current) savedAudioRef.current.volume = 0.3;
    wilhelmAudioRef.current = new Audio("/audio/wilhelm.mp3");
    wilhelmAudioRef.current.preload = "auto";
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (punishAudioRef.current) {
        punishAudioRef.current.pause();
        punishAudioRef.current = null;
      }
      if (savedAudioRef.current) {
        savedAudioRef.current.pause();
        savedAudioRef.current = null;
      }
      if (wilhelmAudioRef.current) {
        wilhelmAudioRef.current.pause();
        wilhelmAudioRef.current = null;
      }
    };
  }, []);

  const chatters = useMemo(() => (state.status === "ready" ? state.chatters : []), [state]);
  const segments = Math.max(chatters.length, 1);
  const segmentAngle = 360 / segments;

  const wheelSize = 500;
  const outerRadius = wheelSize / 2 - 10;
  const innerRadius = 80;
  const center = wheelSize / 2;
  const doubleDownMiddleIndex = 0;

  const colors = useMemo(
    () => (chatters.length ? chatters.map((_, idx) => fallbackColors[idx % fallbackColors.length]) : fallbackColors),
    [chatters]
  );

  useEffect(() => {
    setDoubleDownActiveIndex(doubleDownMiddleIndex);
    setShowDoubleDownHighlight(false);
  }, [doubleDownMiddleIndex]);

  useEffect(() => {
    const overlay = demonOverlayRef.current;
    if (!overlay) return;
    if (spinning) {
      overlay.currentTime = 0;
      overlay.play().catch(() => {});
    } else {
      overlay.pause();
      overlay.currentTime = 0;
    }
  }, [spinning]);

  useEffect(() => {
    const buttonVideo = demonButtonRef.current;
    const active = spinning || buttonHovered;
    if (!buttonVideo) return;
    if (active) {
      buttonVideo.play().catch(() => {});
    } else {
      buttonVideo.pause();
      buttonVideo.currentTime = 0;
    }
  }, [buttonHovered, spinning]);

  useEffect(() => {
    return () => {
      if (punishmentTimerRef.current) {
        clearTimeout(punishmentTimerRef.current);
      }
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
      }
      if (actionsTimerRef.current) {
        clearTimeout(actionsTimerRef.current);
      }
      if (doubleDownLoopTimerRef.current) {
        clearTimeout(doubleDownLoopTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!result) return;
    setShowActionSheet(true);
    setActiveAction(null);
    setRevealStage("prelude");
    setActionsVisible(false);
    setPunishmentPhase("idle");
    setPunishmentText(null);
    setWinnerAnimationKey((key) => key + 1);
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
    }
    if (actionsTimerRef.current) {
      clearTimeout(actionsTimerRef.current);
    }
    playWilhelm();
    revealTimerRef.current = setTimeout(() => {
      setRevealStage("winner");
  
    }, 1200);
    actionsTimerRef.current = setTimeout(() => {
      setActionsVisible(true);
    }, 2000);
  }, [result]);

  function playWilhelm() {
    const wilhelm = wilhelmAudioRef.current;
    if (wilhelm) {
      wilhelm.currentTime = 0;
      wilhelm.play().catch(() => {});
    }
  }

  function playSound(tone: PunishmentTone) {
    const targetAudio = tone === "saved" ? savedAudioRef.current : punishAudioRef.current;
    if (!targetAudio) return;
    targetAudio.currentTime = 0;
    targetAudio.play().catch(() => {});
  }

  function startPunishmentSequence(text: string, tone: PunishmentTone) {
    if (punishmentTimerRef.current) {
      clearTimeout(punishmentTimerRef.current);
    }
    setPunishmentTone(tone);
    setPunishmentText(text);
    setPunishmentPhase("intro");
    punishmentTimerRef.current = setTimeout(() => {
      setPunishmentPhase("reveal");
      playSound(tone);
    }, 1500);
  }

  function resetOverlay() {
    setShowActionSheet(false);
    setActiveAction(null);
    setRevealStage("idle");
    setActionsVisible(false);
    setPunishmentPhase("idle");
    setPunishmentText(null);
    setDoubleDownSpinning(false);
    setShowDoubleDownHighlight(false);
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
    }
    if (actionsTimerRef.current) {
      clearTimeout(actionsTimerRef.current);
    }
    if (doubleDownLoopTimerRef.current) {
      clearTimeout(doubleDownLoopTimerRef.current);
    }
  }

  function spin() {
    if (!chatters.length || spinning) return;

    resetOverlay();
    setResult(null);
    setDoubleDownReady(false);
    setDoubleDownError(null);

    const winnerIndex = Math.floor(Math.random() * chatters.length);
    const spins = 8 + Math.floor(Math.random() * 4);

    const winnerStartAngle = winnerIndex * segmentAngle + (segmentAngle / 2 + 100);
    const currentMod = spinAngle % 360;
    let adjustment = 90 - winnerStartAngle - currentMod;

    if (adjustment <= 0) adjustment += 360;

    const target = spinAngle + spins * 360 + adjustment;

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

  function handleAction(action: ActionChoice) {
    setActiveAction(action);
    setPunishmentPhase("idle");
    setPunishmentText(null);
    setShowDoubleDownHighlight(false);

    if (action === "doubleDown") {
      setDoubleDownReady(false);
      if (!doubleDownLoading) {
        loadDoubleDownOptions();
      }
      return;
    }

    if (action === "forgive") {
      startPunishmentSequence("Forgiven", "saved");
      return;
    }

    if (action === "timeout") {
      startPunishmentSequence("10 minute time out", "punish");
      return;
    }

    startPunishmentSequence("Banished from chat", "punish");
  }

  async function loadDoubleDownOptions() {
    try {
      setDoubleDownLoading(true);
      const res = await fetch("/api/twitch/doubledown");
      const data = (await res.json()) as { options?: string[]; error?: string };
      setDoubleDownOptions(data.options?.filter(Boolean) ?? defaultDoubleDownOptions);
      setDoubleDownError(res.ok ? null : "Using fallback double down list.");
      setDoubleDownReady(true);
    } catch (error) {
      console.error("Failed to load double down options", error);
      setDoubleDownOptions(defaultDoubleDownOptions);
      setDoubleDownError("Using fallback double down list.");
      setDoubleDownReady(true);
    } finally {
      setDoubleDownLoading(false);
    }
  }

  function spinDoubleDown() {
    if (!doubleDownOptions.length || doubleDownSpinning) return;
    if (doubleDownLoopTimerRef.current) {
      clearTimeout(doubleDownLoopTimerRef.current);
    }
    const winnerIndex = Math.floor(Math.random() * doubleDownOptions.length);
    const totalSteps = 24 + Math.floor(Math.random() * 10);
    const maxDelay = 420;
    const minDelay = 80;

    setDoubleDownSpinning(true);
    setShowDoubleDownHighlight(true);
    setDoubleDownActiveIndex(Math.floor(Math.random() * doubleDownOptions.length));

    const spinAudio = audioRef.current;
    const previousVolume = spinAudio?.volume ?? 1;
    if (spinAudio) {
      spinAudio.volume = 0.5;
      spinAudio.currentTime = 0;
      spinAudio.play().catch(() => {});
    }

    const finalizeSpin = () => {
      setDoubleDownSpinning(false);
      const choice = doubleDownOptions[winnerIndex];
      const tone: PunishmentTone = choice.toLowerCase().includes("save") ? "saved" : "punish";
      setShowDoubleDownHighlight(true);
      startPunishmentSequence(choice, tone);
      if (spinAudio) {
        spinAudio.volume = previousVolume;
      }
      doubleDownLoopTimerRef.current = null;
    };

    const stepThroughList = (step: number) => {
      const progress = step / totalSteps;
      const delay = minDelay + Math.pow(progress, 2) * (maxDelay - minDelay);
      const isLast = step === totalSteps;
      const nextIndex = isLast ? winnerIndex : Math.floor(Math.random() * doubleDownOptions.length);

      doubleDownLoopTimerRef.current = setTimeout(() => {
        setDoubleDownActiveIndex(nextIndex);

        if (!isLast) {
          stepThroughList(step + 1);
        } else {
          finalizeSpin();
        }
      }, delay);
    };

    stepThroughList(1);
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
      <video
        ref={demonOverlayRef}
        className={`pointer-events-none fixed inset-0 z-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 ease-out ${spinning ? "opacity-50" : ""}`}
        src="/videos/demontys.mp4"
        loop
        muted
        playsInline
        preload="auto"
      />
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
                    videoRef.current.muted = true;
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
          @keyframes winner-pop {
            0% {
              transform: scale(0.85);
              opacity: 0;
            }
            50% {
              transform: scale(1.05);
              opacity: 1;
            }
            100% {
              transform: scale(1);
              opacity: 1;
            }
          }
          .animate-winner-pop {
            animation: winner-pop 900ms ease-out forwards;
          }
          @keyframes punishment-reveal {
            0% {
              opacity: 0;
              transform: translateY(10px) scale(0.98);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          .animate-punishment-reveal {
            animation: punishment-reveal 700ms ease-out forwards;
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
            <p className="text-sm mt-2">Add the required environment variables, restart the app, then retry:</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              <li>TWITCH_CLIENT_ID</li>
              <li>TWITCH_CLIENT_SECRET</li>
              <li>TWITCH_REDIRECT_URI</li>
              <li>TWITCH_STATE_SECRET</li>
            </ul>
            {state.missing.length > 0 && (
              <p className="mt-3 text-xs text-rose-700 dark:text-rose-200">Detected missing: {state.missing.join(", ")}</p>
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
            <div className="relative mx-auto flex h-[620px] w-full max-w-5xl items-center justify-center">
              <div className="relative h-[520px] w-[520px] rounded-full bg-slate-950/70 shadow-[0_20px_70px_rgba(0,0,0,0.55)] ring-[14px] ring-slate-900/70">
                <div className="absolute right-[-130px] top-1/2 z-30 -translate-y-1/2 rotate-6">
                  <div className="relative h-48 w-48">
                    <Image src="/images/wheel-pointer.png" alt="Pointer" fill className="object-contain" priority />
                  </div>
                </div>

                <div className="absolute inset-4 transition-transform duration-[5000ms] ease-[cubic-bezier(0.25,0.1,0.2,1)]" style={{ transform: `rotate(${spinAngle}deg)` }}>
                  <svg viewBox={`0 0 ${wheelSize} ${wheelSize}`} className="h-full w-full drop-shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
                    <circle cx={center} cy={center} r={outerRadius + 4} fill="rgba(15,23,42,0.75)" />
                    {Array.from({ length: segments }).map((_, idx) => {
                      const startAngle = (idx * segmentAngle * Math.PI) / 180;
                      const endAngle = ((idx + 1) * segmentAngle * Math.PI) / 180;
                      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

                      const sx = center + outerRadius * Math.cos(startAngle);
                      const sy = center + outerRadius * Math.sin(startAngle);
                      const ex = center + outerRadius * Math.cos(endAngle);
                      const ey = center + outerRadius * Math.sin(endAngle);

                      const six = center + innerRadius * Math.cos(endAngle);
                      const siy = center + innerRadius * Math.sin(endAngle);
                      const sdx = center + innerRadius * Math.cos(startAngle);
                      const sdy = center + innerRadius * Math.sin(startAngle);

                      const path = [
                        `M ${sx} ${sy}`,
                        `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${ex} ${ey}`,
                        `L ${six} ${siy}`,
                        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${sdx} ${sdy}`,
                        "Z",
                      ].join(" ");

                      const midAngle = startAngle + (endAngle - startAngle) / 2;
                      const labelRadius = innerRadius + (outerRadius - innerRadius) * 0.62;
                      const lx = center + labelRadius * Math.cos(midAngle);
                      const ly = center + labelRadius * Math.sin(midAngle);
                      const labelRotation = (midAngle * 180) / Math.PI;
                      const label = chatters[idx] ?? "";

                      return (
                        <g key={idx}>
                          <path d={path} fill={colors[idx % colors.length]} />
                          {label && (
                            <text
                              x={lx}
                              y={ly}
                              fill="black"
                              fontSize="15"
                              fontWeight="700"
                              textAnchor="middle"
                              transform={`rotate(${labelRotation}, ${lx}, ${ly})`}
                              dominantBaseline="middle"
                              style={{ letterSpacing: "0.04em", paintOrder: "stroke", stroke: "rgba(0,0,0,0.45)", strokeWidth: 1 }}
                            >
                              {label}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <button
                  type="button"
                  onClick={spin}
                  disabled={spinning || !chatters.length}
                  onMouseEnter={() => setButtonHovered(true)}
                  onMouseLeave={() => setButtonHovered(false)}
                  className="font-red-devil absolute left-1/2 top-1/2 z-20 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-rose-500 to-rose-600 text-2xl font-black uppercase tracking-[0.2em] text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)] transition hover:scale-105 active:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <video
                    ref={demonButtonRef}
                    className={`pointer-events-none absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 ${spinning || buttonHovered ? "opacity-60" : ""}`}
                    src="/videos/demontys.mp4"
                    loop
                    muted
                    playsInline
                    preload="auto"
                  />
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
      {showActionSheet && result && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-700" />
          <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <p
                className={`font-red-devil text-3xl font-black uppercase tracking-[0.24em] text-rose-100 transition-all duration-600 ${
                  revealStage === "prelude" ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
                }`}
              >
                The BLAME goes to....
              </p>
              <p
                key={winnerAnimationKey}
                className={`font-red-devil text-4xl font-black uppercase tracking-wide text-rose-200 transition-all duration-600 ${
                  revealStage === "winner" ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                }`}
              >
                {result.winner}
              </p>
            </div>

            {actionsVisible && (
              <div className="flex flex-wrap justify-center gap-3 text-left transition-opacity duration-700">
                <button
                  type="button"
                  onClick={() => handleAction("timeout")}
                  className={`rounded-full border px-5 py-3 text-sm font-semibold text-white shadow-lg backdrop-blur ${
                    activeAction === "timeout"
                      ? "border-rose-400 bg-rose-600/80"
                      : "border-white/10 bg-white/10 hover:bg-white/15"
                  }`}
                >
                  10 minute time out
                </button>
                <button
                  type="button"
                  onClick={() => handleAction("ban")}
                  className={`rounded-full border px-5 py-3 text-sm font-semibold text-white shadow-lg backdrop-blur ${
                    activeAction === "ban" ? "border-rose-400 bg-rose-600/80" : "border-white/10 bg-white/10 hover:bg-white/15"
                  }`}
                >
                  Ban them
                </button>
                <button
                  type="button"
                  onClick={() => handleAction("forgive")}
                  className={`rounded-full border px-5 py-3 text-sm font-semibold text-white shadow-lg backdrop-blur ${
                    activeAction === "forgive"
                      ? "border-emerald-300 bg-emerald-500/70"
                      : "border-white/10 bg-white/10 hover:bg-white/15"
                  }`}
                >
                  Forgive
                </button>
                <button
                  type="button"
                  onClick={() => handleAction("doubleDown")}
                  className={`rounded-full border px-5 py-3 text-sm font-semibold text-white shadow-lg backdrop-blur ${
                    activeAction === "doubleDown"
                      ? "border-rose-400 bg-rose-600/80"
                      : "border-white/10 bg-white/10 hover:bg-white/15"
                  }`}
                >
                  <span className="font-red-devil text-lg uppercase text-rose-100">Double Down</span>
                </button>
              </div>
            )}

            {activeAction === "doubleDown" && (
              <div className="w-full max-w-3xl space-y-4 rounded-3xl border border-white/10 bg-black/30 p-5 text-left shadow-2xl backdrop-blur-md">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Double down</p>
                    <h4 className="font-red-devil text-2xl font-black uppercase text-rose-100">Risk it all</h4>
                    {doubleDownError && <p className="text-xs text-amber-300">{doubleDownError}</p>}
                  </div>
                  <button
                    type="button"
                    disabled={doubleDownSpinning || doubleDownLoading || !doubleDownReady}
                    onClick={spinDoubleDown}
                    className="font-red-devil inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2 text-base font-black uppercase tracking-[0.2em] text-white shadow-lg transition hover:from-rose-400 hover:to-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {doubleDownSpinning ? "Spinning..." : doubleDownLoading ? "Loading..." : "Spin"}
                  </button>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex max-h-80 flex-col gap-2 overflow-auto px-1 py-1">
                    {doubleDownOptions.map((option, idx) => (
                      <div
                        key={`${option}-${idx}`}
                        className={`flex h-[56px] items-center justify-center text-center text-base font-semibold transition-all duration-200 ${
                          idx === doubleDownActiveIndex && showDoubleDownHighlight
                            ? "rounded-xl bg-rose-500/20 text-white ring-2 ring-rose-400/60 shadow-lg shadow-rose-500/10"
                            : "text-slate-100/80"
                        }`}
                      >
                        {option}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {punishmentPhase !== "idle" && punishmentText && (
              <div className="w-full max-w-3xl space-y-3 rounded-3xl border border-white/10 bg-black/30 p-4 text-center shadow-2xl backdrop-blur">
                <p className="text-base uppercase tracking-[0.28em] text-slate-200 transition-opacity duration-700">
                  The punishment is.....
                </p>
                {punishmentPhase === "reveal" ? (
                  <p
                    className={`animate-punishment-reveal text-3xl font-black ${punishmentTone === "saved" ? "text-emerald-300" : "text-rose-300"} ${
                      punishmentTone === "saved" ? "font-sans" : "font-red-devil"
                    }`}
                  >
                    {punishmentText}
                  </p>
                ) : (
                  <p className="text-xl text-slate-200 opacity-60">...</p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                resetOverlay();
                setResult(null);
              }}
              className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:bg-white/15"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
