import type { Metadata } from "next";
import Link from "next/link";
import { getRecessionData, monthLabel, type RecessionData } from "@/app/lib/recession";
import { FieldReports } from "../FieldReports";
import { MoneyLadder } from "../MoneyLadder";
import { Landfill } from "../Landfill";
import { ExperienceSlider } from "../ExperienceSlider";
import { PayVsChart } from "../PayVsChart";
import { ThemeToggle } from "@/app/components/ThemeToggle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "The Recession Indicator: Tech",
  description:
    "An almanac of the Australian tech job market. Job postings, graduate odds and the collective mood of the internet, charted for your morbid curiosity.",
  alternates: { canonical: "/recession/tech" },
};

const nf = new Intl.NumberFormat("en-AU");

export default async function RecessionPage() {
  const data = await getRecessionData();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 text-slate-900 dark:text-slate-100">
      <Masthead data={data} />
      <ReadingStrip data={data} />
      <DoomTicker data={data} />
      <LongChart data={data} />
      <WhingeSection data={data} />
      <CompetitionSection data={data} />
      <ThenVsNowSection data={data} />
      <PayLadderSection data={data} />
      <LandfillSection data={data} />
      <RaceSection data={data} />
      <PayVsSection />
      <ExperienceSection data={data} />
      <BacklogSection data={data} />
      <FieldReports funPosts={data.funPosts} auSubs={data.auSubs} globalSubs={data.globalSubs} />
      <Methodology data={data} />
    </div>
  );
}

/* ---------------- masthead ---------------- */

function Masthead({ data }: { data: RecessionData }) {
  return (
    <header className="border-b-4 border-double border-slate-900 pb-4 pt-8 dark:border-slate-200">
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
        <span>
          <Link href="/recession" className="hover:underline">← All industries</Link>
          <span className="mx-2">·</span>
          Tech jobs edition
        </span>
        <div className="flex items-center gap-3">
          <span>Vol. 1 · {monthLabel(data.latest.month)}</span>
          <ThemeToggle />
        </div>
      </div>
      <h1 className="font-display mt-1 text-5xl leading-none tracking-wide sm:text-7xl">
        The Recession Indicator
      </h1>
      <p className="mt-2 max-w-2xl font-serif text-sm italic text-slate-600 dark:text-slate-300">
        An almanac of the Australian tech job market. Updated whenever it gets worse.
      </p>
    </header>
  );
}

/* ---------------- headline reading ---------------- */

function ReadingStrip({ data }: { data: RecessionData }) {
  const bigItems = [
    {
      label: `vs the ${monthLabel(data.peak.month)} peak`,
      value: `${data.vsPeakPct}%`,
    },
    { label: "vs 2006, the fax era", value: `${data.vs2006Pct}%` },
  ];
  return (
    <>
      <section className="grid gap-px border border-slate-300 bg-slate-300 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-[2fr_1fr_1fr]">
        <div className="bg-white p-5 dark:bg-slate-900">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Current reading
          </div>
          <div
            className={`font-display mt-1 text-6xl leading-none text-red-700 dark:text-red-500 ${
              data.indexLabel === "Cooked" ? "reading-cooked" : ""
            }`}
          >
            {data.indexLabel}
          </div>
          <p className="mt-2 font-serif text-sm text-slate-600 dark:text-slate-300">
            {nf.format(data.latest.value)} tech job postings a month, nationally. There were{" "}
            {nf.format(data.peak.value)} at the peak.
          </p>
        </div>
        {bigItems.map((it) => (
          <div key={it.label} className="flex flex-col justify-between bg-white p-5 dark:bg-slate-900">
            <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {it.label}
            </div>
            <div
              className={`font-display text-4xl leading-none ${
                it.value.startsWith("-") ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {it.value}
            </div>
          </div>
        ))}
      </section>
      <section className="grid grid-cols-2 gap-px border border-t-0 border-slate-300 bg-slate-300 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-5">
        {data.yearly.map((y) => (
          <div key={y.yearsAgo} className="bg-white px-4 py-3 dark:bg-slate-900">
            <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
              vs {y.yearsAgo} year{y.yearsAgo > 1 ? "s" : ""} ago
            </div>
            <div
              className={`font-display text-3xl leading-none ${
                y.pct < 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {y.pct > 0 ? "+" : ""}{y.pct}%
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400">
              {monthLabel(y.month)}: {nf.format(y.value)} postings
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

/* ---------------- the big 20-year chart ---------------- */

type Annotation = { month: string; label: string; dy?: number };

const ANNOTATIONS: Annotation[] = [
  { month: "2008-09", label: "GFC" },
  { month: "2020-04", label: "Lockdowns" },
  { month: "2022-05", label: "Free money era peaks", dy: -8 },
];

function LongChart({ data }: { data: RecessionData }) {
  const months = data.ivi.months;
  const values = data.ivi.series.ictProfessionals.values;
  const W = 920;
  const H = 300;
  const PAD = { l: 46, r: 14, t: 26, b: 30 };
  const max = Math.max(...values);
  const x = (i: number) => PAD.l + (i / (months.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${path} L${x(values.length - 1).toFixed(1)},${H - PAD.b} L${x(0).toFixed(1)},${H - PAD.b} Z`;

  const yearTicks: number[] = [];
  months.forEach((m, i) => {
    if (m.endsWith("-01") && Number(m.slice(0, 4)) % 4 === 2) yearTicks.push(i);
  });

  const lastIdx = values.length - 1;

  return (
    <section className="mt-10">
      <SectionHeading
        kicker="Exhibit A"
        title="Twenty years of tech job postings"
        blurb="Monthly online job postings for ICT professionals across Australia. The big mountain is 2008, the smaller one is the free-money era. You live in the valley."
      />
      <div className="overflow-x-auto border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px]" role="img" aria-label="ICT job postings per month, 2006 to now">
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(max * f) + 3} textAnchor="end" className="fill-slate-400 text-[9px]">
                {Math.round((max * f) / 1000)}k
              </text>
            </g>
          ))}
          <path d={area} className="fill-red-700/10 dark:fill-red-400/10" />
          <path d={path} fill="none" className="stroke-red-700 dark:stroke-red-400" strokeWidth="1.6" />
          {yearTicks.map((i) => (
            <text key={i} x={x(i)} y={H - 10} textAnchor="middle" className="fill-slate-400 text-[9px]">
              {months[i].slice(0, 4)}
            </text>
          ))}
          {ANNOTATIONS.map((a) => {
            const i = months.indexOf(a.month);
            if (i < 0) return null;
            return (
              <g key={a.month}>
                <line x1={x(i)} x2={x(i)} y1={y(values[i]) - 6} y2={PAD.t + 8 + (a.dy ?? 0)} className="stroke-slate-400" strokeWidth="0.75" strokeDasharray="2 3" />
                <text x={x(i)} y={PAD.t + 4 + (a.dy ?? 0)} textAnchor="middle" className="fill-slate-500 text-[10px] dark:fill-slate-400">
                  {a.label}
                </text>
              </g>
            );
          })}
          <g>
            <circle cx={x(lastIdx)} cy={y(values[lastIdx])} r="3" className="fill-red-700 dark:fill-red-400" />
            <text x={x(lastIdx) - 6} y={y(values[lastIdx]) - 8} textAnchor="end" className="fill-slate-700 text-[10px] font-bold dark:fill-slate-200">
              you are here
            </text>
          </g>
        </svg>
      </div>
      <p className="mt-1 text-right text-[11px] text-slate-400">
        Source: Jobs and Skills Australia, Internet Vacancy Index (trend). CC BY 4.0.
      </p>
    </section>
  );
}

/* ---------------- whinge-o-meter ---------------- */

function WhingeSection({ data }: { data: RecessionData }) {
  // weekly once there's enough history to look respectable; daily until then
  const weeks = data.redditWeekly.slice(-16);
  const useWeekly = weeks.length >= 6;
  const bars = useWeekly
    ? weeks.map((w) => ({ key: w.weekStart, count: w.count }))
    : data.redditDaily.slice(-21).map((d) => ({ key: d.day, count: d.count }));
  const max = Math.max(1, ...bars.map((b) => b.count));
  const dateLabel = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit B"
        title="The whinge-o-meter"
        blurb={`Posts per ${useWeekly ? "week" : "day"} on Australian job subreddits (r/ausjobs, r/auscorp). Every bar is people asking where the jobs went.`}
      />
      {bars.length >= 2 ? (
        <>
          <div className="border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-end gap-1" style={{ height: 160 }}>
              {bars.map((b, i) => (
                <div key={b.key} className="flex flex-1 flex-col items-center justify-end gap-1 self-stretch">
                  <span className="h-3.5 text-[10px] leading-none text-slate-500 dark:text-slate-400">{b.count}</span>
                  <div
                    className="w-full bg-amber-500/80 dark:bg-amber-400/70"
                    style={{ height: `${Math.max(3, (b.count / max) * 120)}px` }}
                    title={`${useWeekly ? "week of " : ""}${b.key}: ${b.count} posts`}
                  />
                  <span className="h-3 text-[9px] leading-none text-slate-400">
                    {useWeekly || bars.length <= 10 || i % 2 === 0 ? dateLabel(b.key) : ""}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-right text-[10px] text-slate-400">
              {useWeekly
                ? "complete weeks only, Mondays marked"
                : "complete days only; switches to weekly once enough history piles up"}
            </p>
          </div>
          {data.adsPerWhinge && (
            <p className="mt-3 border-l-2 border-amber-500 pl-3 font-serif text-sm text-slate-600 dark:text-slate-300">
              Current exchange rate: <strong>{data.adsPerWhinge.ratio} fresh Seek tech job postings per r/ausjobs post</strong> over
              the last 30 days ({nf.format(data.adsPerWhinge.ads)} postings, {nf.format(data.adsPerWhinge.whinges)} posts).
              When this number reaches 1 we will simply assign each poster their own posting.
            </p>
          )}
        </>
      ) : (
        <p className="border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
          Still collecting posting history. Reddit only lets us walk back so far, so the bars fill in as the
          collector keeps running. Check back in a week or two.
        </p>
      )}
    </section>
  );
}

/* ---------------- your competition ---------------- */

// cohort model shared by Exhibits C and I: each class of the last five
// years, and how many of them are estimated to still be hunting
function computeGradBacklog(data: RecessionData) {
  const grads = data.refStats.ictGradsPerYear.value;
  const shares = data.refStats.gradStillLookingShares.values;
  const currentYear = new Date().getFullYear();
  const cohorts = shares.map((share, i) => ({
    year: currentYear - i,
    count: Math.round(grads * share),
    share,
  }));
  const pool = cohorts.reduce((a, c) => a + c.count, 0);
  return { grads, cohorts, pool };
}

function CompetitionSection({ data }: { data: RecessionData }) {
  const s = data.seekLatest;
  const { grads, pool } = computeGradBacklog(data);
  const gradPostings = s["seek-ict-graduate"];
  const gradsPerPosting = Number.isFinite(gradPostings) && gradPostings > 0
    ? Math.round(grads / 12 / gradPostings)
    : null;
  const queuePerPosting = Number.isFinite(gradPostings) && gradPostings > 0
    ? Math.round(pool / gradPostings)
    : null;

  const cells = [
    { label: "New domestic ICT grads minted a year", value: grads },
    { label: "Grads from the last five classes estimated still hunting", value: pool },
    { label: "Tech job postings a month (IVI)", value: data.latest.value },
    { label: "Tech postings on Seek (last 31 days)", value: s["seek-ict-all"] },
    { label: "…mentioning “graduate”", value: s["seek-ict-graduate"] },
    { label: "…mentioning “junior”", value: s["seek-ict-junior"] },
  ].filter((c) => Number.isFinite(c.value));

  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit C"
        title="Your competition"
        blurb="Australia mints about five thousand domestic ICT graduates every year, before counting international completions, which more than double it. The ones who don't get picked up don't vanish. They queue."
      />
      <div className="grid gap-px border border-slate-300 bg-slate-300 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-3">
        {cells.map((c) => (
          <div key={c.label} className="bg-white p-4 dark:bg-slate-900">
            <div className="font-display text-4xl leading-none">{nf.format(c.value as number)}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{c.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 border-l-2 border-red-700 pl-3 font-serif text-sm text-slate-600 dark:border-red-500 dark:text-slate-300">
        {nf.format(pool)} domestic grads from the classes of the last five years are estimated to still be
        looking, against {nf.format(data.latest.value)} tech postings a month nationwide, and most of those
        postings want seniors anyway.
        {gradsPerPosting !== null && (
          <> On Seek right now it is starker: roughly <strong>{nf.format(gradsPerPosting)} fresh grads per
          &ldquo;graduate&rdquo; posting</strong> from this month&apos;s cohort alone.</>
        )}
        {queuePerPosting !== null && <> Count the whole queue and it is about {nf.format(queuePerPosting)} of
        you per graduate posting. Exhibit I breaks the queue down by year.</>}
      </p>
      <p className="mt-2 text-[11px] text-slate-400">
        {data.refStats.ictGradsPerYear.source}. Still-hunting shares are the model from Exhibit I. Seek counts
        are live, national, ICT classification.
      </p>
    </section>
  );
}

/* ---------------- then vs now ---------------- */

function ThenVsNowSection({ data }: { data: RecessionData }) {
  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit D"
        title="Then versus now"
        blurb="Just pull yourself up by your bootstraps lil bro."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {data.thenVsNow.map((card) => (
          <article key={card.heading} className="flex flex-col border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="font-display text-2xl tracking-wide">{card.heading}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-widest text-slate-400">Then</dt>
                <dd className="font-serif text-slate-700 dark:text-slate-200">{card.then}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-widest text-slate-400">Now</dt>
                <dd className="font-serif text-slate-700 dark:text-slate-200">{card.now}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-slate-200 pt-3 font-serif text-sm italic text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {card.punchline}
            </p>
            <p className="mt-auto pt-3 text-[11px] text-slate-400">{card.maths}</p>
          </article>
        ))}
      </div>
      <YearlyAlmanac data={data} />
    </section>
  );
}

// one line of annotated history per year, newest first
const YEAR_QUIPS: Record<number, (v: { value: number; pct: number }) => string> = {
  1: (v) => `${v.pct}% in a single year. You were told it had bottomed out.`,
  2: () => `The bottom was also called this year. It was not the bottom.`,
  3: () => `Layoffs everywhere, and still nearly double today's postings. The bad old days, allegedly.`,
  4: () => `Free-money era. Juniors were fielding counter-offers. Counter-offers!`,
  5: (v) => `${nf.format(v.value)} a month and everyone still complained. Nobody knew.`,
};

function YearlyAlmanac({ data }: { data: RecessionData }) {
  return (
    <div className="mt-4 border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-2 text-[11px] uppercase tracking-widest text-slate-500 dark:border-slate-700 dark:text-slate-400">
        The last five years, annotated
      </div>
      <ol className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.yearly.map((y) => (
          <li key={y.yearsAgo} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2.5">
            <span className="font-display text-xl leading-none">{monthLabel(y.month)}</span>
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {nf.format(y.value)} postings/mo
            </span>
            <span className={`font-mono text-xs tabular-nums ${y.pct < 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
              {y.pct > 0 ? "+" : ""}{y.pct}% vs now
            </span>
            <span className="font-serif text-sm italic text-slate-600 dark:text-slate-300">
              {YEAR_QUIPS[y.yearsAgo]?.(y) ?? ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------- doom ticker ---------------- */

function DoomTicker({ data }: { data: RecessionData }) {
  return (
    <section className="mt-2 grid gap-px border border-slate-300 bg-slate-300 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-2">
      <div className="bg-white px-5 py-3 dark:bg-slate-900">
        <span className="font-display text-4xl leading-none tabular-nums text-red-700 dark:text-red-400">
          {nf.format(data.daysSincePeak)}
        </span>
        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
          days since tech job postings peaked ({monthLabel(data.peak.month)})
        </span>
      </div>
      <div className="bg-white px-5 py-3 dark:bg-slate-900">
        <span className="font-display text-4xl leading-none tabular-nums text-red-700 dark:text-red-400">
          {nf.format(data.daysSinceRecentPeak)}
        </span>
        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
          days since the free-money era peak ({monthLabel(data.recentPeak.month)}). Any day now.
        </span>
      </div>
    </section>
  );
}

/* ---------------- pay ladder ---------------- */

function PayLadderSection({ data }: { data: RecessionData }) {
  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit E"
        title="The pay ladder"
        blurb="Just how far are you from the richest man on earth?"
      />
      <MoneyLadder refStats={data.refStats} />
    </section>
  );
}

/* ---------------- application landfill ---------------- */

function LandfillSection({ data }: { data: RecessionData }) {
  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit F"
        title="The application landfill"
      />
      <Landfill refStats={data.refStats} adsPerYear={data.adsPerYear} />
    </section>
  );
}

/* ---------------- the race to home ---------------- */

function RaceSection({ data }: { data: RecessionData }) {
  const r = data.refStats;
  const then = r.sydneyHouse2006.value / r.gradSalary2006.value;
  const now = r.sydneyHouseNow.value / r.medianGradSalary.value;
  const max = Math.max(then, now);
  const rows = [
    { year: "2006", years: then, salary: r.gradSalary2006.value, house: r.sydneyHouse2006.value },
    { year: "2026", years: now, salary: r.medianGradSalary.value, house: r.sydneyHouseNow.value },
  ];

  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit G"
        title="The race to home"
        blurb="How many years of a grad salary it takes to buy the median Sydney house, if you spend literally nothing else the whole time."
      />
      <div className="border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-5">
          {rows.map((row) => (
            <div key={row.year}>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-display text-2xl leading-none">{row.year}</span>
                <span className="font-display text-4xl leading-none text-red-700 dark:text-red-400 tabular-nums">
                  {row.years.toFixed(1)} years
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {nf.format(row.house)} house ÷ {nf.format(row.salary)} grad salary
                </span>
              </div>
              <div className="mt-1 h-4 w-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full bg-red-700/80 dark:bg-red-500/80"
                  style={{ width: `${(row.years / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 font-serif text-sm italic text-slate-600 dark:text-slate-300">
          The house got {(data.refStats.sydneyHouseNow.value / data.refStats.sydneyHouse2006.value).toFixed(1)}x more
          expensive while the grad salary grew {(data.refStats.medianGradSalary.value / data.refStats.gradSalary2006.value).toFixed(1)}x.
          The finish line is moving faster than you are.
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          {r.gradSalary2006.source}; {r.medianGradSalary.source}; {r.sydneyHouse2006.source}; {r.sydneyHouseNow.source}.
        </p>
      </div>
    </section>
  );
}

/* ---------------- your pay vs everything else ---------------- */

function PayVsSection() {
  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit H"
        title="Your pay against everything else"
        blurb="Twenty years of pay next to the things it is supposed to buy. Click a line to spotlight it."
      />
      <PayVsChart />
      <p className="mt-3 border-l-2 border-red-700 pl-3 font-serif text-sm text-slate-600 dark:border-red-500 dark:text-slate-300">
        Pay nearly doubled in twenty years, which sounds fine until you notice the house more than tripled.
        The gap between those lines is why both your parents work and why your deposit is theoretical.
      </p>
    </section>
  );
}

/* ---------------- experience paradox ---------------- */

function ExperienceSection({ data }: { data: RecessionData }) {
  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit I"
        title="The experience paradox"
        blurb="Drag the slider to your years of experience and see how many of the current tech job postings are actually aimed at you."
      />
      <ExperienceSlider seekLatest={data.seekLatest} />
    </section>
  );
}

/* ---------------- the backlog ---------------- */

function BacklogSection({ data }: { data: RecessionData }) {
  const { cohorts, pool } = computeGradBacklog(data);
  const maxCount = cohorts[0].count;

  const gradPostings = data.seekLatest["seek-ict-graduate"];
  const perPosting = Number.isFinite(gradPostings) && gradPostings > 0 ? Math.round(pool / gradPostings) : null;

  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit J"
        title="The backlog"
        blurb="Every class of graduates competes with the classes before them who never got picked up. The queue does not reset each year. It compounds."
      />
      <div className="border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-3">
          {cohorts.map((c, i) => (
            <div key={c.year}>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-display text-xl leading-none">Class of {c.year}</span>
                <span className="font-mono text-xs tabular-nums text-red-700 dark:text-red-400">
                  {nf.format(c.count)} still hunting
                </span>
                <span className="text-[11px] text-slate-400">
                  {i === 0 ? "all of them, they just got here" : `${Math.round(c.share * 100)}% of the cohort`}
                </span>
              </div>
              <div className="mt-1 h-4 w-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full bg-red-700/80 dark:bg-red-500/80"
                  style={{ width: `${(c.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 font-serif text-sm italic text-slate-600 dark:text-slate-300">
          {nf.format(pool)} domestic graduates in the hunger pool at once
          {perPosting !== null
            ? `, chasing ${nf.format(gradPostings)} postings that say "graduate". That is ${nf.format(perPosting)} of you per posting. Wear something memorable.`
            : ". International completions would more than double this, but we are trying to keep morale above zero."}
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          Cohort size: {data.refStats.ictGradsPerYear.source}. Still-hunting shares:{" "}
          {data.refStats.gradStillLookingShares.source}
        </p>
      </div>
    </section>
  );
}

/* ---------------- shared bits ---------------- */

function SectionHeading({ kicker, title, blurb }: { kicker: string; title: string; blurb?: string }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] uppercase tracking-widest text-red-700 dark:text-red-400">{kicker}</div>
      <h2 className="font-display text-3xl tracking-wide sm:text-4xl">{title}</h2>
      {blurb && <p className="mt-1 max-w-2xl font-serif text-sm text-slate-600 dark:text-slate-300">{blurb}</p>}
    </div>
  );
}

function Methodology({ data }: { data: RecessionData }) {
  return (
    <footer className="mt-14 border-t border-slate-300 pt-5 text-xs leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
      <h2 className="font-display text-xl tracking-wide text-slate-700 dark:text-slate-200">Is this a larp?</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          Historical job postings: {data.ivi.source}, retrieved {data.ivi.retrieved} from{" "}
          <a className="underline" href={data.ivi.sourceUrl} rel="noreferrer" target="_blank">
            jobsandskills.gov.au
          </a>{" "}
          ({data.ivi.licence}). Trend series, ICT Professionals (ANZSCO 26), Australia-wide.
        </li>
        <li>
          Live job counts: Seek search totals for the ICT classification, national, ads posted in the last 31 days.
          Keyword slices count postings matching that keyword and overlap freely. Snapshotted daily.
        </li>
        <li>
          Whinge data: post counts from public subreddit feeds. Reddit only exposes recent history, so the meter
          deepens the longer we collect. Post frequency measures conversation, not unemployment.
        </li>
        <li>
          Graduate competition: {data.refStats.ictGradsPerYear.source}. The backlog model&apos;s still-hunting
          shares are an illustrative decay anchored to the GOS 2024 result; the working is shown on the exhibit.
        </li>
        <li>
          Pay figures: {data.refStats.medianCeoPay.source}; {data.refStats.awote.source};{" "}
          {data.refStats.medianGradSalary.source}; {data.refStats.pmSalary.source}. House prices:{" "}
          {data.refStats.sydneyHouse2006.source} and {data.refStats.sydneyHouseNow.source}. Landfill maths shows its
          working on the exhibit and lets you set the one number nobody publishes.
        </li>
        <li>
          Uhh this is not financial advice and this page is satire or whatever, don&apos;t shoot the messenger.
        </li>
      </ul>
      <p className="mt-4">
        <Link className="underline" href="/">
          Back to spycy.fun
        </Link>
      </p>
    </footer>
  );
}
