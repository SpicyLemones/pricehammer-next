// Shared between the generic industry template and the bespoke tech page:
// the plain-language explanation of how a reading was scored, and the
// most-advertised-roles leaderboard. Prop-based so either page's data
// shape can feed them.

import type { TopRole } from "@/app/lib/recession-industries";

const nf = new Intl.NumberFormat("en-AU");

export function ReadingExplainer({
  indexLabel,
  latestValue,
  seriesTitle,
  level,
  momentumPct,
  typical,
}: {
  indexLabel: string;
  latestValue: number;
  seriesTitle: string;
  level: number;
  momentumPct: number;
  typical: number;
}) {
  const levelPct = Math.round(level * 100);
  const mom = momentumPct;

  let verdict: string;
  if (indexLabel === "Hiring" && level >= 1.25) {
    verdict = `That puts this industry at ${levelPct}% of its own normal, comfortably clear of the 125% bar, so the reading is Hiring regardless of momentum.`;
  } else if (indexLabel === "Hiring") {
    verdict = `That puts this industry above its own normal (${levelPct}%) while climbing ${mom}% over five years, and above normal plus climbing fast counts as Hiring.`;
  } else if (indexLabel === "Cooked") {
    verdict = `That puts this industry at ${levelPct}% of its own normal, under the 70% floor. Nothing else gets weighed once you are that far below your usual self. Cooked.`;
  } else {
    verdict = `That puts this industry at ${levelPct}% of its own normal with momentum at ${mom > 0 ? "+" : ""}${mom}%, which clears the Cooked floor but misses the Hiring bar. Ehhh is the honest middle.`;
  }

  return (
    <section className="mt-2 border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
        Why it reads {indexLabel}
      </div>
      <div className="mt-3 grid gap-px border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-3">
        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">Jobs available now</div>
          <div className="font-display mt-1 text-3xl leading-none">{nf.format(latestValue)}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            postings last month for {seriesTitle}
          </div>
        </div>
        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">A normal month</div>
          <div className="font-display mt-1 text-3xl leading-none">{nf.format(typical)}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            the middle month of twenty years of data, so right now is {levelPct}% of normal
          </div>
        </div>
        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">Momentum</div>
          <div className={`font-display mt-1 text-3xl leading-none ${mom < 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
            {mom > 0 ? "+" : ""}{mom}%
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            versus the same month five years ago, the direction things are heading
          </div>
        </div>
      </div>
      <p className="mt-3 font-serif text-sm text-slate-600 dark:text-slate-300">
        In plain terms: we compare how many jobs this industry advertises right now against what has been normal
        for it across twenty years, then check whether the trend is up or down. At 125% of normal or better the
        reading is <span className="font-semibold">Hiring</span>, and so is above normal with 15%+ growth over
        five years. At 70% of normal or worse it is <span className="font-semibold">Cooked</span>. Everything in
        between is <span className="font-semibold">Ehhh</span>. {verdict}
      </p>
    </section>
  );
}

export function RolesLeaderboard({
  roles,
  industryName,
  kicker,
}: {
  roles: TopRole[];
  industryName: string;
  kicker: string;
}) {
  if (!roles.length) return null;
  const max = Math.max(1, ...roles.map((r) => r.postings));
  const sampled = roles[0]?.sampled ?? 0;

  return (
    <section className="mt-12">
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-widest text-red-700 dark:text-red-400">{kicker}</div>
        <h2 className="font-display text-3xl tracking-wide sm:text-4xl">The job leaderboard</h2>
        <p className="mt-1 font-serif text-sm text-slate-600 dark:text-slate-300">
          The ten most advertised kinds of {industryName.toLowerCase()} job right now, counted from a sample of{" "}
          {nf.format(sampled)} live Seek postings. Whatever the degree promised, this is what the market is
          actually buying.
        </p>
      </div>
      <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
        <ol className="divide-y divide-slate-100 dark:divide-slate-800">
          {roles.map((r) => {
            const share = sampled ? Math.round((r.postings / sampled) * 100) : 0;
            return (
              <li key={r.rank} className="flex items-center gap-3 px-4 py-2">
                <span className="font-mono w-6 shrink-0 text-right text-xs text-slate-400">{r.rank}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-display text-lg leading-none">{r.role}</span>
                    <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {nf.format(r.postings)} posting{r.postings === 1 ? "" : "s"} · {share}% of the sample
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full bg-sky-600/70 dark:bg-sky-400/60"
                      style={{ width: `${(r.postings / max) * 100}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Role types are Seek&apos;s own subclassifications on each live posting, national sample, refreshed with
        each collector run. Private advertisers count here too, since even a mystery employer has to say what
        the job is.
      </p>
    </section>
  );
}
