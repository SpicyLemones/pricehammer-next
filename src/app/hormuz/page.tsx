import type { Metadata } from "next";

// Schrodinger's Hormuz: the strait is both open and closed until somebody
// observes it. This page performs the observation every fifteen minutes.
// Verdict is a stated keyword model over live headlines, and the joke only
// works because every number and headline on the page is real.

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Schrodinger's Hormuz",
  description: "Is the Strait of Hormuz open or closed? Observation collapses the waveform every fifteen minutes.",
  alternates: { canonical: "/hormuz" },
};

type Headline = { title: string; source: string; date: Date; link: string };

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&");

async function fetchHeadlines(): Promise<Headline[] | null> {
  try {
    const res = await fetch(
      "https://news.google.com/rss/search?q=%22strait%20of%20hormuz%22&hl=en-AU&gl=AU&ceid=AU:en",
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 900 } },
    );
    if (!res.ok) return null;
    const xml = await res.text();
    const items: Headline[] = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = m[1];
      const rawTitle = decode((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] ?? "");
      const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] ?? "";
      const dateStr = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
      const date = dateStr ? new Date(dateStr) : new Date(0);
      // Google News appends " - Source" to titles
      const split = rawTitle.match(/^(.*) - ([^-]+)$/);
      items.push({
        title: split ? split[1] : rawTitle,
        source: split ? split[2].trim() : "",
        date,
        link,
      });
    }
    items.sort((a, b) => b.date.getTime() - a.date.getTime());
    return items.slice(0, 10);
  } catch {
    return null;
  }
}

// the observation: closed only if a recent headline reports actual closure,
// not the daily threat to close it
const THREAT_RE = /threat|warn|vow|could|may |might|would|plans? to|risk|weigh|consider/i;
const CLOSED_RE = /\b(closed|closes|closure|shut(s| down)?|blockaded?|blocked|mined)\b/i;

function observe(headlines: Headline[]) {
  const now = Date.now();
  const recent = headlines.filter((h) => now - h.date.getTime() < 4 * 86_400_000);
  const closureReports = recent.filter((h) => CLOSED_RE.test(h.title) && !THREAT_RE.test(h.title));
  const threats = headlines.filter((h) => THREAT_RE.test(h.title));
  return {
    closed: closureReports.length >= 2,
    closureReports,
    threatCount: threats.length,
  };
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });

export default async function HormuzPage() {
  const headlines = await fetchHeadlines();
  const obs = headlines ? observe(headlines) : null;
  const open = obs ? !obs.closed : true;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 text-slate-900 dark:text-slate-100">
      <header className="border-b-4 border-double border-slate-900 pb-4 dark:border-slate-200">
        <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
          A quantum observation service · refreshed every 15 minutes
        </div>
        <h1 className="font-display mt-1 text-5xl leading-none tracking-wide sm:text-6xl">
          Schrodinger&apos;s Hormuz
        </h1>
        <p className="mt-2 font-serif text-sm italic text-slate-600 dark:text-slate-300">
          The Strait of Hormuz is both open and closed until somebody observes it. We observe it, so you can
          keep not thinking about where petrol comes from.
        </p>
      </header>

      <section className="mt-8 border border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
        <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Current observation: the strait is
        </div>
        <div
          className={`font-display mt-2 text-8xl leading-none ${
            open ? "text-emerald-600 dark:text-emerald-400" : "text-red-700 dark:text-red-500"
          }`}
        >
          {open ? "OPEN" : "CLOSED"}
        </div>
        <p className="mt-3 font-serif text-sm text-slate-600 dark:text-slate-300">
          {open
            ? "The waveform has collapsed in your favour. Roughly a fifth of the world's oil floats on."
            : "The waveform has collapsed the other way. Multiple current reports describe the strait as shut. Petrol is about to become a topic at dinner."}
        </p>
        {obs && obs.threatCount > 0 && open && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {obs.threatCount} of the last {headlines!.length} headlines contain somebody threatening to change
            that. This is within normal parameters.
          </p>
        )}
      </section>

      <section className="mt-2 grid gap-px border border-slate-300 bg-slate-300 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-3">
        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="font-display text-3xl leading-none">~20%</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            of the world&apos;s oil passes through it, roughly 20 million barrels a day (US EIA)
          </div>
        </div>
        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="font-display text-3xl leading-none">33 km</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            wide at its narrowest point, with two 3 km shipping lanes doing all the work
          </div>
        </div>
        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="font-display text-3xl leading-none">0</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            times it has actually been fully closed, despite a truly heroic number of announcements
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-widest text-red-700 dark:text-red-400">The evidence</div>
          <h2 className="font-display text-3xl tracking-wide">Latest field reports</h2>
        </div>
        {headlines ? (
          <ol className="divide-y divide-slate-100 border border-slate-300 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
            {headlines.map((h, i) => (
              <li key={i} className="px-4 py-2.5">
                <a href={h.link} target="_blank" rel="noopener noreferrer" className="group">
                  <span className="font-serif text-sm text-slate-700 group-hover:underline dark:text-slate-200">
                    {h.title}
                  </span>
                  <span className="ml-2 font-mono text-[11px] text-slate-400">
                    {h.source} · {fmtDate(h.date)}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
            The observation apparatus is down, which means the strait is currently both open and closed. Enjoy
            the superposition while it lasts.
          </p>
        )}
      </section>

      <footer className="mt-10 border-t border-slate-300 pt-4 text-xs leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <p>
          Methodology: headlines from Google News mentioning the Strait of Hormuz, refreshed every fifteen
          minutes. The verdict flips to CLOSED only when multiple current reports describe an actual closure,
          not the regularly scheduled threat of one. Oil volumes: US Energy Information Administration. This
          page is satire wrapped around real data, which lately is hard to tell apart from the news itself.
        </p>
      </footer>
    </div>
  );
}
