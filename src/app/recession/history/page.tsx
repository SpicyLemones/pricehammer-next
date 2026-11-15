import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { issueLabel } from "@/app/lib/recession-industries";
import { getHistoryOverview, type Change, type TrendPoint } from "@/app/lib/recession-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Recession Indicator: The Archive",
  description: "Weekly Seek job posting counts for every industry, tracked over time. Pick a past week to see the board as it stood.",
  alternates: { canonical: "/recession/history" },
};

const nf = new Intl.NumberFormat("en-AU");

function dayLabel(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ChangeCell({ change }: { change: Change | null }) {
  if (!change) return <td className="px-3 py-2 text-right text-slate-400">–</td>;
  const up = change.diff > 0;
  const flat = change.diff === 0;
  const pct = change.pct == null ? "" : `${up ? "+" : ""}${change.pct.toFixed(Math.abs(change.pct) < 10 ? 1 : 0)}%`;
  return (
    <td
      className={`px-3 py-2 text-right tabular-nums ${
        flat ? "text-slate-500" : up ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
      }`}
      title={`${nf.format(change.from.value)} on ${dayLabel(change.from.day)}`}
    >
      {flat ? "no change" : `${up ? "▲" : "▼"} ${pct}`}
      <span className="ml-1 text-[11px] text-slate-400">
        ({up ? "+" : ""}
        {nf.format(change.diff)})
      </span>
    </td>
  );
}

function Sparkline({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return <span className="text-slate-400">–</span>;
  const w = 96;
  const h = 24;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const t0 = Date.parse(points[0].day);
  const t1 = Date.parse(points[points.length - 1].day);
  const d = points
    .map((p, i) => {
      const x = 2 + ((Date.parse(p.day) - t0) / (t1 - t0 || 1)) * (w - 4);
      const y = 2 + (1 - (p.value - min) / span) * (h - 4);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const falling = vals[vals.length - 1] < vals[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <path
        d={d}
        fill="none"
        strokeWidth={1.5}
        className={falling ? "stroke-red-700 dark:stroke-red-400" : "stroke-emerald-700 dark:stroke-emerald-400"}
      />
    </svg>
  );
}

export default async function RecessionHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const { days, selected, rows } = await getHistoryOverview(date);
  const isLatest = selected === days[0];
  const tracked = rows.filter((r) => r.at);

  return (
    <div className="recession-page mx-auto w-full max-w-5xl px-4 pb-16 text-slate-900 dark:text-slate-100">
      <header className="border-b-4 border-double border-slate-900 pb-4 pt-8 dark:border-slate-200">
        <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
          <span>
            <Link href="/recession" className="hover:underline">← All industries</Link>
            <span className="mx-2">·</span>
            The archive
          </span>
          <div className="flex items-center gap-3">
            <span>Vol. 1 · {issueLabel()}</span>
            <ThemeToggle />
          </div>
        </div>
        <h1 className="font-display mt-1 text-5xl leading-none tracking-wide sm:text-7xl">The Recession Indicator</h1>
        <p className="mt-2 font-serif text-sm italic text-slate-600 dark:text-slate-300">
          Every industry&rsquo;s job board, week by week. Pick a date to see how cooked things were then.
        </p>
      </header>

      {!selected ? (
        <p className="mt-10 border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
          Nothing has been collected on this deployment yet. The collector runs every week; check back after the next run.
        </p>
      ) : (
        <>
          <section className="mt-8">
            <div className="text-[11px] uppercase tracking-widest text-red-700 dark:text-red-400">
              {isLatest ? "Latest collection" : "Back issue"}
            </div>
            <h2 className="font-display text-3xl tracking-wide sm:text-4xl">The board on {dayLabel(selected)}</h2>
            <p className="mt-1 font-serif text-sm text-slate-600 dark:text-slate-300">
              Live postings on Seek, national, at each weekly collection. {days.length} collection
              {days.length === 1 ? "" : "s"} on file since {dayLabel(days[days.length - 1])}.
              {!isLatest && (
                <>
                  {" "}
                  <Link href="/recession/history" className="underline">Jump to the latest</Link>.
                </>
              )}
            </p>

            <form method="get" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor="date" className="text-slate-600 dark:text-slate-300">Go to a date</label>
              <input
                id="date"
                type="date"
                name="date"
                defaultValue={selected}
                min={days[days.length - 1]}
                max={days[0]}
                className="border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
              />
              <button className="border border-slate-900 px-3 py-1 hover:bg-slate-900 hover:text-white dark:border-slate-200 dark:hover:bg-slate-200 dark:hover:text-slate-900">
                Show
              </button>
            </form>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {days.slice(0, 26).map((d) => (
                <Link
                  key={d}
                  href={d === days[0] ? "/recession/history" : `/recession/history?date=${d}`}
                  className={`border px-2 py-0.5 ${
                    d === selected
                      ? "border-slate-900 bg-slate-900 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900"
                      : "border-slate-300 hover:border-slate-900 dark:border-slate-700 dark:hover:border-slate-200"
                  }`}
                >
                  {dayLabel(d)}
                </Link>
              ))}
            </div>
          </section>

          <div className="mt-6 overflow-x-auto border border-slate-300 dark:border-slate-700">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-100 text-left text-[11px] uppercase tracking-widest text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-normal">Industry</th>
                  <th className="px-3 py-2 text-right font-normal">Postings</th>
                  <th className="px-3 py-2 text-right font-normal">vs week before</th>
                  <th className="px-3 py-2 text-right font-normal">vs 4 weeks before</th>
                  <th className="px-3 py-2 text-right font-normal">Since tracking began</th>
                  <th className="px-3 py-2 text-right font-normal">Grad</th>
                  <th className="px-3 py-2 font-normal">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {tracked.map((r) => (
                  <tr key={r.slug}>
                    <td className="px-3 py-2">
                      <Link href={`/recession/${r.slug}`} className="underline decoration-slate-300 hover:decoration-slate-900 dark:decoration-slate-600">
                        {r.name}
                      </Link>
                      {r.at!.day !== selected && (
                        <span className="ml-2 text-[11px] text-slate-400">read {dayLabel(r.at!.day)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-display text-lg tabular-nums">{nf.format(r.at!.value)}</td>
                    <ChangeCell change={r.week} />
                    <ChangeCell change={r.month} />
                    <ChangeCell change={r.sinceStart} />
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {r.graduate ? nf.format(r.graduate.value) : "–"}
                    </td>
                    <td className="px-3 py-2"><Sparkline points={r.points} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            Counts are Seek&rsquo;s own totals for each search, collected weekly. A change column is blank when no
            collection ran close enough to that point to compare fairly. &ldquo;Grad&rdquo; is postings mentioning
            &ldquo;graduate&rdquo;.
          </p>
        </>
      )}
    </div>
  );
}
