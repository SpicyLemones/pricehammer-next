// src/app/page.tsx
const tiles = [
  {
    title: "PriceHammer",
    subtitle: "Go to the price tracker",
    href: "https://pricehammer.xyz",
    external: true,
  },
  { title: "Twitch fun", subtitle: "Stream-side experiments", href: "#", external: false },
  { title: "Placeholder A", subtitle: "Coming soon", href: "#", external: false },
  { title: "Placeholder B", subtitle: "Coming soon", href: "#", external: false },
];

export default function HomePage() {
  return (
    <div className="flex flex-col items-center gap-10">
      <header className="mt-6 text-center space-y-2">
        <h1 className="text-5xl font-semibold tracking-tight text-slate-900 dark:text-white">Spyce.fun</h1>
        <p className="text-lg text-slate-500 dark:text-slate-300">:)</p>
      </header>

      <section className="w-full max-w-4xl grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tiles.map((tile) => {
          const commonClasses =
            "flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white/80 p-5 text-slate-900 shadow-sm transition hover:-translate-y-1 hover:shadow-xl active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-50";

          if (tile.external) {
            return (
              <a
                key={tile.title}
                href={tile.href}
                rel="noreferrer"
                className={commonClasses}
                target="_blank"
              >
                <div className="space-y-1">
                  <h2 className="text-2xl font-semibold">{tile.title}</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-300">{tile.subtitle}</p>
                </div>
                <span className="text-sm font-medium text-blue-600 dark:text-blue-300">Open</span>
              </a>
            );
          }

          return (
            <button
              key={tile.title}
              type="button"
              className={commonClasses}
            >
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold">{tile.title}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-300">{tile.subtitle}</p>
              </div>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-200">Stay tuned</span>
            </button>
          );
        })}
      </section>

      <footer className="mb-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Credits placeholder — coming soon.
      </footer>
    </div>
  );
}
