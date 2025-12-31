// src/app/twitch/page.tsx
import Link from "next/link";

const modules = [
  { title: "Pre-Stream Checklist", description: "Quick rundown before you go live." },
  { title: "Stream Quest", description: "Mini missions to keep chat engaged." },
  { title: "Wheel of Blame", description: "Spin to assign the next oops." },
  { title: "Toadcoin", description: "A silly stream currency idea." },
];

export const metadata = {
  title: "Twitch fun modules",
  description: "Pick a playful module to use during streams.",
};

function ModuleButton({ title, description }: { title: string; description: string }) {
  return (
    <button
      type="button"
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
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        <span className="h-1 w-4 rounded-full bg-slate-300 transition group-hover:translate-x-1 group-hover:bg-slate-400 dark:bg-slate-700 dark:group-hover:bg-slate-500" />
        Hover slide effect
      </div>
    </button>
  );
}

export default function TwitchPage() {
  return (
    <div className="w-full max-w-3xl space-y-6">
      <Link
        href="/"
        className="text-sm font-medium text-blue-600 transition hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
      >
        ← Back to Spycy.fun
      </Link>

      <header className="space-y-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">Twitch fun</h1>
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
