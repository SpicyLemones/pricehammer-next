// src/app/twitch/page.tsx
import Link from "next/link";

import { TwitchAuthRedirect } from "./TwitchAuthRedirect";

const modules = [
  { title: "Pre-Stream Checklist", description: "Quick rundown before you go live." },
  {
    title: "Stream Quest",
    description: "Mini missions to keep chat engaged.",
    href: "/twitch/stream-quest",
  },
  {
    title: "Wheel of Blame",
    description: "Spin to assign the next oops with live chatters.",
    href: "/twitch/wheel-of-blame",
  },
  { title: "Toadcoin", description: "A silly stream currency idea." },
];

export const metadata = {
  title: "Twitch fun modules",
  description: "Pick a playful module to use during streams.",
};

function ModuleButton({ title, description, href }: { title: string; description: string; href?: string }) {
  return (
    <Link
      href={href ?? "#"}
      className="group relative flex w-full flex-col gap-2 overflow-hidden rounded-2xl border border-slate-200 bg-white/90 p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl active:translate-y-[1px] active:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 dark:border-slate-800 dark:bg-slate-900/70"
    >
      <span
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 transition duration-300 group-hover:translate-x-full group-hover:opacity-100"
        aria-hidden
      />
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
      </div>
    </Link>
  );
}

export default function TwitchPage() {
  return (
    <div className="w-full max-w-3xl space-y-8 pt-4">
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
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white md:text-5xl">
          Twitch Toybox
        </h1>
        <p className="mx-auto max-w-md text-slate-600 dark:text-slate-400">
          Choose someting to play with during your stream. 
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
