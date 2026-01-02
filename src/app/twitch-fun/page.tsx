// src/app/twitch-fun/page.tsx
import Link from "next/link";

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
      className="group flex w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl active:translate-y-[1px] active:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 dark:border-slate-800 dark:bg-slate-900/70"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
        </div>
        <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition group-hover:border-slate-400 group-hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:group-hover:border-slate-500">
          Open
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_6px_rgba(74,222,128,0.25)]" />
        Interactive
      </div>
    </Link>
  );
}

export default function TwitchFunPage() {
  return (
    <div className="w-full max-w-3xl space-y-6">
      <Link
        href="/"
        className="text-sm font-medium text-blue-600 transition hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
      >
        ← Back to Spycy.fun
      </Link>

      <header className="space-y-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Twitch fun
        </h1>
        <p className="text-slate-600 dark:text-slate-300">
          Choose a module to play with during your stream. Everything here is simple and tactile.
        </p>
      </header>

      <section className="space-y-3">
        {modules.map((module) => (
          <ModuleButton key={module.title} {...module} />
        ))}
      </section>
    </div>
  );
}
