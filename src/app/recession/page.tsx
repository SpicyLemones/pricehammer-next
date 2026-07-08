import type { Metadata } from "next";
import Link from "next/link";
import { getRecessionData, monthLabel, type RecessionData } from "@/app/lib/recession";
import { FieldReports } from "./FieldReports";
import { MoneyLadder } from "./MoneyLadder";
import { Landfill } from "./Landfill";
import { ExperienceSlider } from "./ExperienceSlider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "The Recession Indicator",
  description:
    "An almanac of the Australian tech job market. Job ads, graduate odds and the collective mood of the internet, charted for your morbid curiosity.",
  alternates: { canonical: "/recession" },
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
      <GraduateCorner data={data} />
      <ThenVsNowSection data={data} />
      <PayLadderSection data={data} />
      <LandfillSection data={data} />
      <RaceSection data={data} />
      <ExperienceSection data={data} />
      <FieldReports funPosts={data.funPosts} auSubs={data.auSubs} globalSubs={data.globalSubs} />
      <Methodology data={data} />
    </div>
  );
}

/* ---------------- masthead ---------------- */

function Masthead({ data }: { data: RecessionData }) {
  return (
    <header className="border-b-4 border-double border-slate-900 pb-4 pt-8 dark:border-slate-200">
      <div className="flex items-baseline justify-between text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
        <span>Tech jobs edition</span>
        <span>Vol. 1 · {monthLabel(data.latest.month)}</span>
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
  const items = [
    {
      label: `vs the ${monthLabel(data.peak.month)} peak`,
      value: `${data.vsPeakPct}%`,
    },
    { label: "vs five years ago", value: `${data.vsFiveYearsPct}%` },
    { label: "vs 2006, the fax era", value: `${data.vs2006Pct}%` },
  ];
  return (
    <section className="grid gap-px border border-slate-300 bg-slate-300 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-[2fr_1fr_1fr_1fr]">
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
          {nf.format(data.latest.value)} tech job ads a month, nationally. There were{" "}
          {nf.format(data.peak.value)} at the peak.
        </p>
      </div>
      {items.map((it) => (
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
        title="Twenty years of tech job ads"
        blurb="Monthly online job ads for ICT professionals across Australia. The big mountain is 2008, the smaller one is the free-money era. You live in the valley."
      />
      <div className="overflow-x-auto border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px]" role="img" aria-label="ICT job ads per month, 2006 to now">
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
  const recent = data.redditWeekly.slice(-16);
  const max = Math.max(1, ...recent.map((w) => w.count));
  const weekLabel = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit B"
        title="The whinge-o-meter"
        blurb="Posts per week on Australian job subreddits (r/ausjobs, r/auscorp). Every bar is people asking where the jobs went."
      />
      {recent.length >= 2 ? (
        <>
          <div className="border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-end gap-1" style={{ height: 160 }}>
              {recent.map((w) => (
                <div key={w.weekStart} className="flex flex-1 flex-col items-center justify-end gap-1 self-stretch">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{w.count}</span>
                  <div
                    className="w-full bg-amber-500/80 dark:bg-amber-400/70"
                    style={{ height: `${Math.max(3, (w.count / max) * 120)}px` }}
                    title={`week of ${w.weekStart}: ${w.count} posts`}
                  />
                  <span className="text-[9px] text-slate-400">{weekLabel(w.weekStart)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-right text-[10px] text-slate-400">complete weeks only, Mondays marked</p>
          </div>
          {data.adsPerWhinge && (
            <p className="mt-3 border-l-2 border-amber-500 pl-3 font-serif text-sm text-slate-600 dark:text-slate-300">
              Current exchange rate: <strong>{data.adsPerWhinge.ratio} fresh Seek tech ads per r/ausjobs post</strong> over
              the last 30 days ({nf.format(data.adsPerWhinge.ads)} ads, {nf.format(data.adsPerWhinge.whinges)} posts).
              When this number reaches 1 we will simply assign each poster their own ad.
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

/* ---------------- graduate corner ---------------- */

function GraduateCorner({ data }: { data: RecessionData }) {
  const s = data.seekLatest;
  const cells = [
    { label: "Tech ads on Seek (last 31 days)", value: s["seek-ict-all"] },
    { label: "…mentioning “graduate”", value: s["seek-ict-graduate"] },
    { label: "…mentioning “junior”", value: s["seek-ict-junior"] },
    { label: "…mentioning “senior”", value: s["seek-ict-senior"] },
    { label: "…mentioning “intern”", value: s["seek-ict-intern"] },
    { label: "“Graduate” ads, every industry", value: s["seek-all-graduate"] },
  ].filter((c) => Number.isFinite(c.value));

  if (!cells.length) return null;

  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit C"
        title="The graduate corner"
        blurb="Bring a helmet. Live counts from Seek, national, ICT classification, refreshed daily."
      />
      <div className="grid gap-px border border-slate-300 bg-slate-300 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-3">
        {cells.map((c) => (
          <div key={c.label} className="bg-white p-4 dark:bg-slate-900">
            <div className="font-display text-4xl leading-none">{nf.format(c.value)}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{c.label}</div>
          </div>
        ))}
      </div>
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
    </section>
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
          days since tech job ads peaked ({monthLabel(data.peak.month)})
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
        blurb="Your salary, the Prime Minister's, and an ASX CEO's, drawn to the same scale. There is only one way to appreciate the difference and it is with your scroll wheel."
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
        blurb="If every tech application this year were printed out and thrown in the bin where the ATS filter sent it anyway."
      />
      <Landfill refStats={data.refStats} adsPerYear={data.adsPerYear} />
    </section>
  );
}

/* ---------------- the race you already lost ---------------- */

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
        title="The race you already lost"
        blurb="Years of gross graduate salary to buy the median Sydney house. Every cent, no food, no rent, no tax. Speedrun rules."
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

/* ---------------- experience paradox ---------------- */

function ExperienceSection({ data }: { data: RecessionData }) {
  return (
    <section className="mt-12">
      <SectionHeading
        kicker="Exhibit H"
        title="The experience paradox"
        blurb="Drag the slider to your years of experience and see how many of the current tech ads are actually aimed at you."
      />
      <ExperienceSlider seekLatest={data.seekLatest} />
    </section>
  );
}

/* ---------------- shared bits ---------------- */

function SectionHeading({ kicker, title, blurb }: { kicker: string; title: string; blurb: string }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] uppercase tracking-widest text-red-700 dark:text-red-400">{kicker}</div>
      <h2 className="font-display text-3xl tracking-wide sm:text-4xl">{title}</h2>
      <p className="mt-1 max-w-2xl font-serif text-sm text-slate-600 dark:text-slate-300">{blurb}</p>
    </div>
  );
}

function Methodology({ data }: { data: RecessionData }) {
  return (
    <footer className="mt-14 border-t border-slate-300 pt-5 text-xs leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
      <h2 className="font-display text-xl tracking-wide text-slate-700 dark:text-slate-200">Is this a larp?</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          Historical job ads: {data.ivi.source}, retrieved {data.ivi.retrieved} from{" "}
          <a className="underline" href={data.ivi.sourceUrl} rel="noreferrer" target="_blank">
            jobsandskills.gov.au
          </a>{" "}
          ({data.ivi.licence}). Trend series, ICT Professionals (ANZSCO 26), Australia-wide.
        </li>
        <li>
          Live job counts: Seek search totals for the ICT classification, national, ads posted in the last 31 days.
          Keyword slices count ads matching that keyword and overlap freely. Snapshotted daily.
        </li>
        <li>
          Whinge data: post counts from public subreddit feeds. Reddit only exposes recent history, so the meter
          deepens the longer we collect. Post frequency measures conversation, not unemployment.
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
