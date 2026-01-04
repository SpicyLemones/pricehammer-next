"use client";
import Link from "next/link";
import { useRef } from "react";
import clsx from "clsx"; // Added the missing import
import { TwitchAuthRedirect } from "./TwitchAuthRedirect";

const modules = [
  { 
    title: "Pre-Stream Checklist", 
    description: "Oh the camera's been on the whole time huh?",
    video: "/videos/checklist.mp4" // Optional: add if you have one
  },
  {
    title: "Stream Quest",
    description: "Do your dailies bro",
    href: "/twitch/stream-quest",
    video: "/videos/dailyquest.mp4",
  },
  {
    title: "Wheel of Blame",
    description: "Whose fault is it this time?",
    href: "/twitch/wheel-of-blame",
    video: "/videos/demontys.mp4",
  },
  {
    title: "Chattergrounds",
    description: "Learn a little bit of something about your fans.",
    href: "/twitch/chattergrounds",
    video: "/videos/chattergrounds.mp4",
  },
  { 
    title: "Toadcoin", 
    description: "Rich in the marketplace of ideas",
    video: "/videos/toadcoin.mp4" // Optional
  },
];

function ModuleButton({ 
  title, 
  description, 
  href, 
  video 
}: { 
  title: string; 
  description: string; 
  href?: string;
  video?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMouseEnter = () => {
    if (videoRef.current) {
      videoRef.current.play().catch((err) => console.log("Playback interrupted", err));
    }
  };

  const handleMouseLeave = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
  };

  return (
    <Link
      href={href ?? "#"}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group relative flex w-full flex-col gap-2 overflow-hidden rounded-2xl border border-slate-200 bg-white/90 p-5 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl active:translate-y-[1px] active:shadow-md dark:border-slate-800 dark:bg-slate-900/70"
    >
      {/* Video Background */}
      {video && (
        <>
          <video
            ref={videoRef}
            src={`${video}#t=0.001`}
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 scale-105 group-hover:scale-100"
          />
          {/* Default Tint (Paused) */}
          <div className="absolute inset-0 bg-white/30 dark:bg-black/20 transition-opacity duration-500 group-hover:opacity-0" />
          
          {/* Hover Overlay (Playing) */}
          <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        </>
      )}

      {/* Content with Enhanced Visibility Shadows */}
      <div className="relative z-10">
        <h2 className={clsx(
          "text-xl font-bold tracking-tight transition-all duration-300",
          "text-slate-900 tracking-wide drop-shadow-[0_1.2px_1.2px_rgba(255,255,255,0.8)]",
          "dark:text-white dark:drop-shadow-[0_10px_4px_rgba(0,0,0,0.8)]",
          "group-hover:text-white group-hover:drop-shadow-[0_4px_12px_rgba(0,0,0,1)] group-hover:scale-[1.01]"
        )}>
          {title}
        </h2>
        
        <p className={clsx(
          "text-sm font-medium transition-all duration-300",
          "text-slate-700 drop-shadow-[0_1px_1px_rgba(255,255,255,0.5)]",
          "dark:text-slate-200 dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]",
          "group-hover:text-slate-50 group-hover:drop-shadow-[0_2px_6px_rgba(0,0,0,1)]"
        )}>
          {description}
        </p>
      </div>

      {/* Shine Effect */}
      <span
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition duration-500 group-hover:translate-x-full group-hover:opacity-100"
        aria-hidden
      />
    </Link>
  );
}

export default function TwitchPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 pt-4">
      {/* Pinned Top-Left Back Button */}
      <div className="fixed left-6 top-6 z-50">
        <Link
          href="/"
          className="group flex items-center gap-2 rounded-full border border-slate-200/60 bg-white/80 px-3.5 py-1.5 text-sm font-semibold text-slate-600 shadow-sm backdrop-blur-md transition-all hover:border-slate-300 hover:bg-white hover:text-blue-600 hover:shadow-xl hover:shadow-blue-500/10 active:scale-95 dark:border-slate-800/60 dark:bg-slate-900/80 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:hover:text-blue-400"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-300 group-hover:-translate-x-1"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span className="tracking-tight">Back to Spycy.fun</span>
        </Link>
      </div>

      <header className="space-y-3 text-center">
        <h1 className="text-4xl font-bold tracking-wide text-slate-900 dark:text-white md:text-5xl">
          Twitch Toybox
        </h1>
        <p className="mx-auto max-w-md text-slate-600 dark:text-slate-400">
          Choose something to play with during your stream. 
        </p>
      </header>

      <TwitchAuthRedirect />

      <section className="grid gap-3">
        {modules.map((module) => (
          <ModuleButton key={module.title} {...module} />
        ))}
      </section>
    </div>
  );
}
