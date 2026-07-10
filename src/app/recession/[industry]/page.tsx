import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  INDUSTRIES,
  getIndustryData,
  monthLabel,
  type IndustryData,
  type IndustrySlug,
} from "@/app/lib/recession-industries";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { AdSpendChart } from "../AdSpendChart";
import { PayVsChart } from "../PayVsChart";
import { JobRoulette } from "../JobRoulette";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const nf = new Intl.NumberFormat("en-AU");

type Params = { params: Promise<{ industry: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { industry } = await params;
  const config = INDUSTRIES[industry as IndustrySlug];
  if (!config) return { title: "The Recession Indicator" };
  const title = `The Recession Indicator: ${config.name}`;
  return {
    title,
    description: config.tagline,
    alternates: { canonical: `/recession/${industry}` },
    openGraph: { title, description: config.tagline, url: `/recession/${industry}` },
    twitter: { title, description: config.tagline },
  };
}

export default async function IndustryPage({ params }: Params) {
  const { industry } = await params;
  if (industry === "tech") redirect("/recession/tech");
  if (!(industry in INDUSTRIES)) notFound();
  const data = await getIndustryData(industry as IndustrySlug);

  // exhibits letter themselves in page order, no halves
  let letterCode = 65;
  const nextExhibit = () => `Exhibit ${String.fromCharCode(letterCode++)}`;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 text-slate-900 dark:text-slate-100">
      <Masthead data={data} />
      <ReadingStrip data={data} />
      <DoomTicker data={data} />
      <HeadcountStrip data={data} />
      <HookSection hook={data.config.hook} kicker={nextExhibit()} />
      {data.config.extraHook && <HookSection hook={data.config.extraHook} kicker={nextExhibit()} variant="strip" />}
      {data.config.slug === "marketing" && <BigSpendersSection kicker={nextExhibit()} />}
      <LongChart data={data} kicker={nextExhibit()} />
      <SeekTiles data={data} kicker={nextExhibit()} />
      {data.topEmployers.length > 0 && <TopEmployersSection data={data} kicker={nextExhibit()} />}
      <YearlyAlmanac data={data} kicker={nextExhibit()} />
      <PayVsSection data={data} kicker={nextExhibit()} />
      <RouletteSection data={data} kicker={nextExhibit()} />
      {data.config.bigPlayers && <BigPlayersSection data={data} kicker={nextExhibit()} />}
      {!data.hiring && <HopeSection data={data} kicker={nextExhibit()} />}
      <Methodology data={data} />
    </div>
  );
}

/* ---------------- masthead ---------------- */

function Masthead({ data }: { data: IndustryData }) {
  return (
    <header className="border-b-4 border-double border-slate-900 pb-4 pt-8 dark:border-slate-200">
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
        <span>
          <Link href="/recession" className="hover:underline">← All industries</Link>
          <span className="mx-2">·</span>
          {data.config.edition}
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
        {data.config.tagline}
      </p>
    </header>
  );
}

/* ---------------- headline reading ---------------- */

function ReadingStrip({ data }: { data: IndustryData }) {
  const bigItems = [
    { label: `vs the ${monthLabel(data.peak.month)} peak`, value: `${data.vsPeakPct}%` },
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
            className={`font-display mt-1 text-6xl leading-none ${
              data.hiring
                ? "reading-hiring text-emerald-600 dark:text-emerald-400"
                : data.indexLabel === "Cooked"
                  ? "reading-cooked text-red-700 dark:text-red-500"
                  : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {data.indexLabel}
          </div>
          <p className="mt-2 font-serif text-sm text-slate-600 dark:text-slate-300">
            {nf.format(data.latest.value)} job postings a month, nationally ({data.seriesTitle}). The peak was{" "}
            {nf.format(data.peak.value)}.
          </p>
        </div>
        {bigItems.map((it) => (
          <div key={it.label} className="flex flex-col justify-between bg-white p-5 dark:bg-slate-900">
            <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">{it.label}</div>
            <div
              className={`font-display text-4xl leading-none ${
                it.value.startsWith("-") ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {it.value.startsWith("-") ? it.value : `+${it.value}`}
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

/* ---------------- doom (or boom) ticker ---------------- */

function DoomTicker({ data }: { data: IndustryData }) {
  return (
    <section className="mt-2 border border-slate-300 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-900">
      <span className="font-display text-4xl leading-none tabular-nums text-red-700 dark:text-red-400">
        {nf.format(data.daysSincePeak)}
      </span>
      <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
        days since postings peaked ({monthLabel(data.peak.month)}).{" "}
        {data.hiring ? "Not that this industry is complaining." : "Any day now."}
      </span>
    </section>
  );
}

/* ---------------- real humans strip ---------------- */

function HeadcountStrip({ data }: { data: IndustryData }) {
  const h = data.config.headcount;
  if (!h) return null;
  return (
    <section className="mt-2 border border-slate-300 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-900">
      <span className="font-display text-4xl leading-none tabular-nums">{nf.format(h.value)}</span>
      <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
        {h.label} ({h.source}). These are your colleagues, and also your competition.
      </span>
    </section>
  );
}

/* ---------------- why the line moves ---------------- */

function HookSection({ hook, kicker, variant = "boxed" }: { hook: IndustryData["config"]["hook"]; kicker: string; variant?: "boxed" | "strip" }) {
  if (!hook.tiles.length) return null;
  return (
    <section className="mt-10">
      <SectionHeading kicker={kicker} title={hook.title} blurb={hook.blurb} />
      {variant === "boxed" ? (
        <div className="grid gap-px border border-slate-300 bg-slate-300 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-3">
          {hook.tiles.map((t) => (
            <div key={t.small} className="bg-white p-4 dark:bg-slate-900">
              <div className="font-display text-4xl leading-none">{t.big}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.small}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-stretch gap-y-4 border-y-2 border-slate-900 bg-amber-50/60 px-5 py-6 dark:border-slate-100 dark:bg-amber-400/[0.06] sm:flex-row sm:items-start sm:gap-x-2">
          {hook.tiles.map((t, i) => (
            <div key={t.small} className="flex flex-1 items-start gap-x-2">
              {i > 0 && (
                <span className="font-display hidden self-center px-1 text-3xl text-red-700 dark:text-red-400 sm:block" aria-hidden>
                  {hook.flow ? "→" : "·"}
                </span>
              )}
              <div className={hook.flow ? "text-center sm:flex-1" : "sm:flex-1"}>
                <div className="font-display text-5xl leading-none">{t.big}</div>
                <div className="mx-auto mt-2 max-w-[26ch] font-serif text-xs text-slate-600 dark:text-slate-300">{t.small}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {hook.conversion && (
        <div className="mt-px flex flex-wrap items-center justify-center gap-x-8 gap-y-2 border border-t-0 border-slate-300 bg-white px-4 py-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-center">
            <div className="text-4xl tracking-widest" aria-hidden>
              {hook.conversion.from.emoji.repeat(hook.conversion.from.count)}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {hook.conversion.from.count} {hook.conversion.from.label}
            </div>
          </div>
          <div className="font-display text-3xl text-red-700 dark:text-red-400" aria-hidden>→</div>
          <div className="text-center">
            <div className="text-4xl tracking-widest" aria-hidden>
              {hook.conversion.to.emoji.repeat(hook.conversion.to.count)}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {hook.conversion.to.count} {hook.conversion.to.label}
            </div>
          </div>
        </div>
      )}
      <p className="mt-3 border-l-2 border-red-700 pl-3 font-serif text-sm text-slate-600 dark:border-red-500 dark:text-slate-300">
        {hook.punchline}
      </p>
      <p className="mt-2 text-[11px] text-slate-400">{hook.sources}</p>
    </section>
  );
}

/* ---------------- the 20-year chart ---------------- */

const ANNOTATIONS: { month: string; label: string; dy?: number }[] = [
  { month: "2008-09", label: "GFC" },
  { month: "2020-04", label: "Lockdowns" },
  { month: "2022-05", label: "Free money era", dy: -8 },
];

function LongChart({ data, kicker }: { data: IndustryData; kicker: string }) {
  const months = data.months;
  const values = data.values;
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
  const lineCls = data.hiring ? "stroke-emerald-600 dark:stroke-emerald-400" : "stroke-red-700 dark:stroke-red-400";
  const fillCls = data.hiring ? "fill-emerald-600/10 dark:fill-emerald-400/10" : "fill-red-700/10 dark:fill-red-400/10";
  const dotCls = data.hiring ? "fill-emerald-600 dark:fill-emerald-400" : "fill-red-700 dark:fill-red-400";

  return (
    <section className="mt-10">
      <SectionHeading
        kicker={kicker}
        title={`Twenty years of ${data.config.name.toLowerCase()} postings`}
        blurb={`Monthly online job postings, ${data.seriesTitle}, Australia-wide.`}
      />
      <div className="overflow-x-auto border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px]" role="img" aria-label={`${data.seriesTitle} job postings per month, 2006 to now`}>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(max * f) + 3} textAnchor="end" className="fill-slate-400 text-[9px]">
                {Math.round((max * f) / 1000)}k
              </text>
            </g>
          ))}
          <path d={area} className={fillCls} />
          <path d={path} fill="none" className={lineCls} strokeWidth="1.6" />
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
            <circle cx={x(lastIdx)} cy={y(values[lastIdx])} r="3" className={dotCls} />
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

/* ---------------- live seek counts ---------------- */

function SeekTiles({ data, kicker }: { data: IndustryData; kicker: string }) {
  const s = data.seekLatest;
  const slug = data.config.slug;
  const cells = [
    { label: "Postings on Seek (last 31 days)", value: s[`seek-${slug}-all`] },
    { label: "…mentioning “graduate”", value: s[`seek-${slug}-graduate`] },
  ].filter((c) => Number.isFinite(c.value));

  return (
    <section className="mt-12">
      <SectionHeading
        kicker={kicker}
        title="On the board right now"
        blurb="Live counts from Seek, national, refreshed with each collector run."
      />
      {cells.length ? (
        <div className="grid gap-px border border-slate-300 bg-slate-300 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-2">
          {cells.map((c) => (
            <div key={c.label} className="bg-white p-4 dark:bg-slate-900">
              <div className="font-display text-4xl leading-none">{nf.format(c.value as number)}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{c.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
          The live Seek counts have not been loaded on this deployment yet. Check back after the next collector run.
        </p>
      )}
    </section>
  );
}

/* ---------------- who is actually hiring ---------------- */

function TopEmployersSection({ data, kicker }: { data: IndustryData; kicker: string }) {
  const employers = data.topEmployers;
  const max = Math.max(1, ...employers.map((e) => e.postings));
  const sampled = employers[0]?.sampled ?? 0;

  return (
    <section className="mt-12">
      <SectionHeading
        kicker={kicker}
        title="Who is actually hiring"
        blurb={`The twenty employers with the most live ${data.config.name.toLowerCase()} postings on Seek right now, ranked from a sample of ${nf.format(sampled)} current listings. Names straight from the postings, no curation.`}
      />
      <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
        <ol className="divide-y divide-slate-100 dark:divide-slate-800">
          {employers.map((e) => (
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
                    style={{ width: `${(e.postings / max) * 100}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Live Seek sample, national, refreshed with each collector run. Private advertisers excluded. Nobody
        publishes hire or layoff counts in Australia, so live postings are the honest proxy.
      </p>
    </section>
  );
}

/* ---------------- yearly almanac ---------------- */

function YearlyAlmanac({ data, kicker }: { data: IndustryData; kicker: string }) {
  return (
    <section className="mt-12">
      <SectionHeading kicker={kicker} title="The last five years, annotated" />
      <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
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
                {data.config.quips[y.yearsAgo] ?? ""}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------- the big spenders (marketing only) ---------------- */

function BigSpendersSection({ kicker }: { kicker: string }) {
  return (
    <section className="mt-10">
      <SectionHeading
        kicker={kicker}
        title="The big spenders"
        blurb="The biggest advertising budgets on earth that can be sourced without a paywall, ranked. Ad Age tracks the full top 50 behind a subscription; these are the ones with public numbers."
      />
      <AdSpendChart />
      <p className="mt-2 text-[11px] text-slate-400">
        Reported advertising or marketing expenses from annual filings; definitions vary by company. Ranking
        context: Ad Age, World&apos;s Largest Advertisers 2024.
      </p>
    </section>
  );
}

/* ---------------- your pay vs everything else ---------------- */

function PayVsSection({ data, kicker }: { data: IndustryData; kicker: string }) {
  return (
    <section className="mt-12">
      <SectionHeading
        kicker={kicker}
        title="Your pay against everything else"
        blurb="Twenty years of full-time pay in this industry's own ABS division, next to the things it is supposed to buy. Click a line to spotlight it."
      />
      <PayVsChart industry={data.config.slug} />
      <p className="mt-3 border-l-2 border-red-700 pl-3 font-serif text-sm text-slate-600 dark:border-red-500 dark:text-slate-300">
        Pay nearly doubled in twenty years, which sounds fine until you notice the house more than tripled.
        The gap between those lines is why both your parents work and why your deposit is theoretical.
      </p>
    </section>
  );
}

/* ---------------- the application roulette ---------------- */

// anchored to the real national average of 184 applications per job ad
// (SEEK, April 2025, record high), scaled by how the market reads:
// hiring markets sit under the average, cooked ones well over it
function defaultApplicantsFor(data: IndustryData): number {
  if (data.hiring) return 110;
  return data.indexLabel === "Cooked" ? 368 : 184;
}

function RouletteSection({ data, kicker }: { data: IndustryData; kicker: string }) {
  return (
    <section className="mt-12">
      <SectionHeading
        kicker={kicker}
        title="The application roulette"
        blurb="One spin is one cold application. The green slice is your statistical share of the posting, drawn to scale. Good luck out there."
      />
      <JobRoulette industryName={data.config.name} defaultApplicants={defaultApplicantsFor(data)} />
    </section>
  );
}

/* ---------------- the big end of town ---------------- */

function BigPlayersSection({ data, kicker }: { data: IndustryData; kicker: string }) {
  const players = data.config.bigPlayers ?? [];
  return (
    <section className="mt-12">
      <SectionHeading
        kicker={kicker}
        title="The big end of town"
        blurb="The largest players in this industry, ranked by heft. Half of them are private, foreign-owned or not-for-profit and publish no Australian profit line, so real figures appear only where they exist."
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

/* ---------------- the hope section ---------------- */

function HopeSection({ data, kicker }: { data: IndustryData; kicker: string }) {
  const hope = data.config.hope;

  if (!hope) {
    // some industries have no proven playbook, and that is its own exhibit
    return (
      <section className="mt-12">
        <SectionHeading kicker={kicker} title="What you can actually do about it" />
        <div className="border border-dashed border-slate-400 bg-white px-6 py-10 text-center dark:border-slate-600 dark:bg-slate-900">
          <p className="font-serif text-sm italic text-slate-500 dark:text-slate-400">
            We went looking for genuine, proven advice for breaking into this market and will publish it the
            moment we find some.
          </p>
          <p className="mt-3 text-[11px] uppercase tracking-widest text-slate-400">
            this space has been blank since {monthLabel(data.peak.month)}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-12">
      <SectionHeading kicker={kicker} title="What actually works" blurb={hope.blurb} />
      <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
        <ol className="divide-y divide-slate-100 dark:divide-slate-800">
          {hope.items.map((it, i) => (
            <li key={it.tip} className="flex gap-3 px-4 py-3">
              <span className="font-display shrink-0 text-2xl leading-none text-emerald-600 dark:text-emerald-400">
                {i + 1}
              </span>
              <div>
                <div className="font-display text-lg leading-none">{it.tip}</div>
                <p className="mt-1 font-serif text-sm text-slate-600 dark:text-slate-300">{it.why}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      {hope.funFact && (
        <p className="mt-3 border-l-2 border-emerald-600 pl-3 font-serif text-sm text-slate-600 dark:border-emerald-400 dark:text-slate-300">
          {hope.funFact}
        </p>
      )}
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

function Methodology({ data }: { data: IndustryData }) {
  return (
    <footer className="mt-14 border-t border-slate-300 pt-5 text-xs leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
      <h2 className="font-display text-xl tracking-wide text-slate-700 dark:text-slate-200">Is this a larp?</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          Historical job postings: {data.ivi.source}, retrieved {data.ivi.retrieved} from{" "}
          <a className="underline" href={data.ivi.sourceUrl} rel="noreferrer" target="_blank">
            jobsandskills.gov.au
          </a>{" "}
          ({data.ivi.licence}). {data.config.occupationNote}.
        </li>
        <li>
          Live counts: Seek search totals, national, ads posted in the last 31 days. Snapshotted with each
          collector run.
        </li>
        <li>The demand-driver figures are cited on the exhibit; the jokes are load-bearing but the numbers are real.</li>
        <li>
          Uhh this is not financial advice and this page is satire or whatever, don&apos;t shoot the messenger.
        </li>
      </ul>
      <p className="mt-4">
        <Link className="underline" href="/recession">
          ← Pick another industry
        </Link>
      </p>
    </footer>
  );
}
