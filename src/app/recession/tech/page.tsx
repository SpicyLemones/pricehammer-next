import type { Metadata } from "next";
import Link from "next/link";
import { getRecessionData, monthLabel, type RecessionData } from "@/app/lib/recession";
import { FieldReports } from "../FieldReports";
import { MoneyLadder } from "../MoneyLadder";
import { Landfill } from "../Landfill";
import { ExperienceSlider } from "../ExperienceSlider";
import { PayVsChart } from "../PayVsChart";
import { JobRoulette } from "../JobRoulette";
import { getIndustryData, getTopEmployers, INDUSTRIES, issueLabel, type IndustryData, type TopEmployer } from "@/app/lib/recession-industries";
import payVsData from "../../../../data/recession/pay-vs-everything.json";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { ReadingExplainer } from "../ReadingBreakdown";
import { RolesToggle } from "../RolesToggle";
import occEmployment from "../../../../data/recession/occupation-employment.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const techDescription = "An almanac of the Australian tech job market. Updated whenever it gets worse.";

export const metadata: Metadata = {
  title: "The Recession Indicator: Tech",
  description: techDescription,
  alternates: { canonical: "/recession/tech" },
  openGraph: { title: "The Recession Indicator: Tech", description: techDescription, url: "/recession/tech" },
  twitter: { title: "The Recession Indicator: Tech", description: techDescription },
};

const nf = new Intl.NumberFormat("en-AU");

export default async function RecessionPage() {
  const data = await getRecessionData();
  const topEmployers = await getTopEmployers("tech");
  const industry = await getIndustryData("tech");
  const competition = industry.competition;

  return (
    <div className="recession-page mx-auto w-full max-w-5xl px-4 pb-16 text-slate-900 dark:text-slate-100">
      <Masthead data={data} />
      <ReadingStrip data={data} />
      <ReadingExplainer
        indexLabel={data.indexLabel}
        latestValue={data.latest.value}
        seriesTitle="ICT Professionals"
        level={industry.reading.level}
        momentumPct={industry.reading.momentumPct}
        typical={industry.reading.typical}
      />
      <DoomTicker data={data} />
      <LongChart data={data} />
      <WhingeSection data={data} />
      <CompetitionSection data={data} topEmployers={topEmployers} />
      <RolesToggle
        employment={(occEmployment.byIndustry as Record<string, { rank: number; occupation: string; employed: number }[]>).tech ?? []}
        employmentQuarter={occEmployment.quarter}
        postings={industry.topRoles}
        industryName="tech"
        kicker="Exhibit D"
      />
      <ThenVsNowSection data={data} />
      <PayLadderSection data={data} />
      <LandfillSection data={data} competition={competition} />
      <RaceSection data={data} />
      <PayVsSection />
      <ExperienceSection data={data} />
      <BacklogSection data={data} />
      <RouletteSection competition={competition} />
      <BigPlayersSection />
      <FieldReports funPosts={data.funPosts} auSubs={data.auSubs} globalSubs={data.globalSubs} kicker="Exhibit N" />
      <HopeGagSection />
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
          <span>Vol. 1 · {issueLabel()}</span>
          <ThemeToggle />
        </div>
      </div>
      <h1 className="font-display mt-1 text-5xl leading-none tracking-wide sm:text-7xl">
        The Recession Indicator
      </h1>
      <p className="mt-2 font-serif text-sm italic text-slate-600 dark:text-slate-300">
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

function CompetitionSection({ data, topEmployers }: { data: RecessionData; topEmployers: TopEmployer[] }) {
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
        you per graduate posting. Exhibit K breaks the queue down by year.</>}
      </p>
      {topEmployers.length > 0 && (
        <div className="mt-4 border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-2 text-[11px] uppercase tracking-widest text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Who is actually hiring: top 20 by live Seek postings
          </div>
          <ol className="divide-y divide-slate-100 dark:divide-slate-800">
            {topEmployers.map((e) => (
              <li key={e.rank} className="flex items-center gap-3 px-4 py-2">
                <span className="font-mono w-6 shrink-0 text-right text-xs text-slate-400">{e.rank}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-display text-lg leading-none">{e.employer}</span>
                    <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {e.postings} posting{e.postings === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full bg-emerald-600/70 dark:bg-emerald-400/60"
                      style={{ width: `${(e.postings / Math.max(1, topEmployers[0]?.postings ?? 1)) * 100}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        {data.refStats.ictGradsPerYear.source}. Still-hunting shares are the model from Exhibit K. Seek counts
        are live, national, ICT classification. Employer ranking from a live posting sample; private
        advertisers excluded. Nobody publishes hire or layoff counts in Australia, so postings are the proxy.
      </p>
    </section>
  );
}

/* ---------------- then vs now ---------------- */

function ThenVsNowSection({ data }: { data: RecessionData }) {
  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit E"
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
        The last five years
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
        kicker="Exhibit F"
        title="The pay ladder"
        blurb="Just how far are you from the richest man on earth?"
      />
      <MoneyLadder refStats={data.refStats} />
    </section>
  );
}

/* ---------------- application landfill ---------------- */

function LandfillSection({ data, competition }: { data: RecessionData; competition: IndustryData["competition"] }) {
  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit G"
        title="The application landfill"
      />
      <Landfill refStats={data.refStats} adsPerYear={data.adsPerYear} defaultApplicants={competition?.applicantsPerPosting ?? 368} />
    </section>
  );
}

/* ---------------- the race to home ---------------- */

function RaceSection({ data }: { data: RecessionData }) {
  const r = data.refStats;
  const house = payVsData.series.house as { year: number; value: number; anchored: boolean }[];
  const grad = payVsData.series.gradSalary as { year: number; value: number; anchored: boolean }[];

  // linear interpolation between published anchors, per year
  const interp = (pts: typeof house, year: number): number => {
    let lo = pts[0];
    let hi = pts[pts.length - 1];
    for (const p of pts) {
      if (p.year <= year && p.year >= lo.year) lo = p;
      if (p.year >= year && p.year < hi.year) hi = p;
    }
    if (lo.year === hi.year) return lo.value;
    return lo.value + ((year - lo.year) / (hi.year - lo.year)) * (hi.value - lo.value);
  };
  const anchorYears = new Set([...house, ...grad].map((p) => p.year));
  const years: { year: number; ratio: number; anchor: boolean }[] = [];
  for (let yr = 2006; yr <= 2026; yr++) {
    years.push({ year: yr, ratio: interp(house, yr) / interp(grad, yr), anchor: anchorYears.has(yr) });
  }

  const W = 920;
  const H = 320;
  const PAD = { l: 48, r: 64, t: 24, b: 28 };
  const maxR = Math.max(...years.map((p) => p.ratio));
  const x = (year: number) => PAD.l + ((year - 2006) / (2026 - 2006)) * (W - PAD.l - PAD.r);
  const y = (ratio: number) => H - PAD.b - (ratio / (maxR * 1.08)) * (H - PAD.t - PAD.b);
  const path = years.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.year).toFixed(1)},${y(p.ratio).toFixed(1)}`).join(" ");
  const first = years[0];
  const last = years[years.length - 1];

  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit H"
        title="The race to home"
        blurb="Years of a median graduate salary needed to buy the median Sydney house, every year since 2006, if every cent went to the house. Yes, your pay rises after graduation; for the sake of the argument, and the horror, this chart holds you at the starting salary the whole way."
      />
      <div className="overflow-x-auto border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px]" role="img" aria-label="Years of graduate salary needed to buy the median Sydney house, 2006 to 2026">
          {[5, 10, 15, 20].map((g) => (
            <g key={g}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(g) + 3} textAnchor="end" className="fill-slate-400 text-[9px]">{g} yrs</text>
            </g>
          ))}
          {[2006, 2010, 2014, 2018, 2022, 2026].map((yr) => (
            <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[9px]">{yr}</text>
          ))}

          <path d={path} fill="none" className="stroke-red-700 dark:stroke-red-400" strokeWidth="2.5" />
          {years.filter((p) => p.anchor).map((p) => (
            <circle key={p.year} cx={x(p.year)} cy={y(p.ratio)} r={3.5} className="fill-red-700 dark:fill-red-400">
              <title>{`${p.year}: ${p.ratio.toFixed(1)} years of a grad salary (published median in at least one series)`}</title>
            </circle>
          ))}
          <text x={x(2006) + 6} y={y(first.ratio) - 8} className="fill-slate-700 text-[11px] font-bold dark:fill-slate-200">
            {first.ratio.toFixed(1)} yrs
          </text>
          <text x={x(2026) + 4} y={y(last.ratio) + 3} className="fill-red-700 text-[11px] font-bold dark:fill-red-400">
            {last.ratio.toFixed(1)} yrs
          </text>
          <text x={x(2016)} y={y(years[10].ratio) - 14} textAnchor="middle" className="fill-slate-400 text-[10px] italic">
            a working lifetime, measured in house
          </text>
        </svg>
      </div>
      <p className="mt-3 border-l-2 border-red-700 pl-3 font-serif text-sm text-slate-600 dark:border-red-500 dark:text-slate-300">
        From {first.ratio.toFixed(1)} years of gross salary in 2006 to {last.ratio.toFixed(1)} now. The house got{" "}
        {(r.sydneyHouseNow.value / r.sydneyHouse2006.value).toFixed(1)}x dearer while the starting salary grew{" "}
        {(r.medianGradSalary.value / r.gradSalary2006.value).toFixed(1)}x. The finish line is moving faster than
        you are.
      </p>
      <p className="mt-2 text-[11px] text-slate-400">
        Dots mark years with a published median in at least one input ({r.sydneyHouse2006.source};{" "}
        {r.sydneyHouseNow.source}; GCA GradStats and QILT GOS for salaries); the line interpolates between
        anchors. No tax, no rent, no food, no pay rises: speedrun rules.
      </p>
    </section>
  );
}

/* ---------------- your pay vs everything else ---------------- */

function PayVsSection() {
  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit I"
        title="Your pay against everything else"
        blurb="Twenty years of full-time pay in tech's own ABS division, next to the things it is supposed to buy. Click a line to spotlight it."
      />
      <PayVsChart industry="tech" />
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
        kicker="Exhibit J"
        title="The experience paradox"
        blurb="Drag the slider to your years of experience and see how many of the current tech job postings are actually aimed at you."
      />
      <ExperienceSlider seekLatest={data.seekLatest} />
    </section>
  );
}

/* ---------------- the backlog ---------------- */

function BacklogSection({ data }: { data: RecessionData }) {
  // the backlog machine: a fixed cohort of graduates arrives every year and
  // the market absorbs them in proportion to real postings, calibrated so
  // 2006 cleared 75% of its pool. Whoever is left rolls into next year.
  // Difficulty = hunters per posting, indexed to 2006 = 1x.
  const GRADS = data.refStats.ictGradsPerYear.value;
  const yearly: Record<number, number[]> = {};
  data.ivi.months.forEach((m, i) => {
    const y = Number(m.slice(0, 4));
    (yearly[y] = yearly[y] ?? []).push(data.ivi.series.ictProfessionals.values[i]);
  });
  const avgPostings: Record<number, number> = {};
  for (const [y, arr] of Object.entries(yearly)) avgPostings[Number(y)] = arr.reduce((a, b) => a + b, 0) / arr.length;
  const startYear = 2006;
  const endYear = Math.max(...Object.keys(avgPostings).map(Number));
  const c = (0.75 * GRADS) / avgPostings[startYear];
  let poolNow = GRADS;
  const rows: { year: number; pool: number; difficulty: number }[] = [];
  for (let yr = startYear; yr <= endYear; yr++) {
    rows.push({ year: yr, pool: Math.round(poolNow), difficulty: poolNow / avgPostings[yr] });
    poolNow = poolNow - Math.min(poolNow, c * avgPostings[yr]) + GRADS;
  }
  const base = rows[0].difficulty;
  rows.forEach((r) => (r.difficulty = r.difficulty / base));
  const last = rows[rows.length - 1];

  const W = 920;
  const H = 320;
  const PAD = { l: 44, r: 66, t: 26, b: 28 };
  const maxD = Math.max(...rows.map((r) => r.difficulty));
  const x = (year: number) => PAD.l + ((year - startYear) / (endYear - startYear)) * (W - PAD.l - PAD.r);
  const y = (d: number) => H - PAD.b - (d / (maxD * 1.06)) * (H - PAD.t - PAD.b);
  const linePath = rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(r.year).toFixed(1)},${y(r.difficulty).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(endYear).toFixed(1)},${y(0)} L${x(startYear).toFixed(1)},${y(0)} Z`;
  const marks = [
    { year: 2009, label: "GFC" },
    { year: 2020, label: "Lockdowns" },
    { year: 2022, label: "Free money" },
  ];

  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit K"
        title="The backlog"
        blurb="Every year a new class of graduates arrives whether the market wants them or not, and whoever is not absorbed rolls into next year's queue. This chart runs that machine on twenty years of real posting data and asks one question: how many times harder is it to get hired than in 2006?"
      />
      <div className="overflow-x-auto border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px]" role="img" aria-label="How many times harder it is for a graduate to get hired than in 2006, by year">
          {[5, 10, 15].filter((g) => g <= maxD).map((g) => (
            <g key={g}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(g) + 3} textAnchor="end" className="fill-slate-400 text-[9px]">{g}x</text>
            </g>
          ))}
          {[2006, 2010, 2014, 2018, 2022, 2026].map((yr) => (
            <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[9px]">{yr}</text>
          ))}

          <path d={areaPath} className="fill-red-700/10 dark:fill-red-400/10" />
          <path d={linePath} fill="none" className="stroke-red-700 dark:stroke-red-400" strokeWidth="2.5" />
          {rows.map((r) => (
            <circle key={r.year} cx={x(r.year)} cy={y(r.difficulty)} r={2.5} className="fill-red-700 dark:fill-red-400">
              <title>{`${r.year}: ${r.difficulty.toFixed(1)}x harder than 2006 (modelled queue: ${nf.format(r.pool)})`}</title>
            </circle>
          ))}
          {marks.map((m) => {
            const row = rows.find((r) => r.year === m.year);
            if (!row) return null;
            return (
              <g key={m.year}>
                <line x1={x(m.year)} x2={x(m.year)} y1={y(row.difficulty) - 8} y2={PAD.t + 6} className="stroke-slate-400" strokeWidth="0.75" strokeDasharray="2 3" />
                <text x={x(m.year)} y={PAD.t} textAnchor="middle" className="fill-slate-500 text-[10px] dark:fill-slate-400">{m.label}</text>
              </g>
            );
          })}
          <circle cx={x(endYear)} cy={y(last.difficulty)} r={4.5} className="fill-red-700 dark:fill-red-400" />
          <text x={x(endYear) + 8} y={y(last.difficulty) + 4} className="fill-red-700 text-[13px] font-bold dark:fill-red-400">
            {last.difficulty.toFixed(0)}x
          </text>
        </svg>
      </div>
      <p className="mt-3 border-l-2 border-red-700 pl-3 font-serif text-sm text-slate-600 dark:border-red-500 dark:text-slate-300">
        By this machine, a graduate applying today faces about {last.difficulty.toFixed(0)}x the competition of a
        2006 graduate. The dips are real hiring booms clearing the queue; the climbs are the queue winning. It has
        been winning since 2022.
      </p>
      <p className="mt-2 text-[11px] text-slate-400">
        The model: {nf.format(GRADS)} domestic ICT graduates arrive each year ({data.refStats.ictGradsPerYear.source});
        hiring absorbs the pool in proportion to real IVI postings, calibrated so 2006 cleared 75% of its queue;
        nobody ever gives up and leaves the field, which is the only optimistic assumption in it. Difficulty is
        hunters per posting, indexed to 2006.
      </p>
    </section>
  );
}

/* ---------------- the big end of town ---------------- */

function RouletteSection({ competition }: { competition: IndustryData["competition"] }) {
  const applicants = competition?.applicantsPerPosting ?? 368;
  const note = competition
    ? `The starting odds assume you are competing with the whole profession: 1,000,000 people in tech against a few thousand live postings a month is ${competition.workersPerPosting} workers per opening, versus about 71 across the whole labour market. Calibrated to the real national average of 184 applications per ad (SEEK, April 2025, a record high), that puts tech at roughly ${applicants} applicants per posting.`
    : undefined;
  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit L"
        title="The application roulette"
        blurb="One spin is one cold application. Assuming you are competing against every other applicant in the industry for the same job, this is your likelihood of coming out on top. The green slice is drawn to scale."
      />
      <JobRoulette industryName="Tech" defaultApplicants={applicants} oddsNote={note} />
    </section>
  );
}

function BigPlayersSection() {
  const players = INDUSTRIES.tech.bigPlayers ?? [];
  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit M"
        title="The big end of town"
        blurb="The largest players in Australian tech, ranked by heft. Figures only where they publish them."
      />
      <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
        <ol className="divide-y divide-slate-100 dark:divide-slate-800">
          {players.map((p, i) => (
            <li key={p.name} className="flex items-baseline gap-3 px-4 py-2.5">
              <span className="font-mono w-6 shrink-0 text-right text-xs text-slate-400">{i + 1}</span>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-display text-lg leading-none">{p.name}</span>
                <span className="font-serif text-sm text-slate-500 dark:text-slate-400">{p.note}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------- the hope section, tech edition ---------------- */

function HopeGagSection() {
  return (
    <section className="mt-12">
      <SectionHeading kicker="Exhibit O" title="What you can actually do about it" />
      <div className="border border-dashed border-slate-400 bg-white px-6 py-10 text-center dark:border-slate-600 dark:bg-slate-900">
        <p className="font-serif text-sm italic text-slate-500 dark:text-slate-400">
          We went looking for genuine, proven advice for breaking into this market and will publish it the
          moment we find some.
        </p>
        <p className="mt-3 text-[11px] uppercase tracking-widest text-slate-400">
          this space has been blank since April 2022
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
      {blurb && <p className="mt-1 font-serif text-sm text-slate-600 dark:text-slate-300">{blurb}</p>}
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
