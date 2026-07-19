// Shared graduate exhibits: the grad index (completions each year against
// measured national job creation, ABS EQ08) and the backlog machine (the
// tech page's compounding-difficulty model, generalised to any industry
// with a grads figure and an IVI series).

const nf = new Intl.NumberFormat("en-AU");

export type GradsConfig = { perYear: number; label: string; source: string };

export type JobsCreated = {
  employed: number;
  growthPerYear: number;
  replacementPerYear: number;
  openingsPerYear: number;
};

export function GradIndexSection({
  grads,
  jobs,
  indexLabel,
  industryName,
  kicker,
}: {
  grads: GradsConfig;
  jobs: JobsCreated | null;
  indexLabel: string;
  industryName: string;
  kicker: string;
}) {
  if (!jobs) return null;
  const seats = jobs.openingsPerYear / grads.perYear;
  const band = seats >= 3 ? "comfortable" : seats >= 1.2 ? "workable" : "thin";

  let verdict: string;
  if (band === "comfortable" && indexLabel === "Cooked") {
    verdict = `On paper that is ${seats.toFixed(1)} seats per graduate, which looks generous for an industry reading Cooked. The catch is who the seats are for: openings count every level, and replacement demand hires experience. The backlog chart below shows what the entry rows actually face.`;
  } else if (band === "comfortable") {
    verdict = `That is roughly ${seats.toFixed(1)} openings per graduate per year. Even after migrants and career changers join the queue, the maths clears. This is what a pipeline with room in it looks like.`;
  } else if (band === "workable") {
    verdict = `That is roughly ${seats.toFixed(1)} openings per graduate per year. Enough to cover the cohort on paper, before migrants, career changers and last year's leftovers join the same queue. Workable, not roomy.`;
  } else {
    verdict = `That is roughly ${seats.toFixed(1)} openings per graduate per year, which does not cover the cohort even before anyone else joins the queue. The industry graduates more people than it makes room for, year after year, and the backlog chart below is what that compounds into.`;
  }

  return (
    <section className="mt-12">
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-widest text-red-700 dark:text-red-400">{kicker}</div>
        <h2 className="font-display text-3xl tracking-wide sm:text-4xl">The graduating class</h2>
        <p className="mt-1 font-serif text-sm text-slate-600 dark:text-slate-300">
          Two national numbers decide how a {industryName.toLowerCase()} graduate&apos;s first year goes: how many
          of you finish the degree, and how many jobs the industry actually makes room for.
        </p>
      </div>
      <div className="grid gap-px border border-slate-300 bg-slate-300 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-3">
        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">New graduates a year</div>
          <div className="font-display mt-1 text-4xl leading-none">~{nf.format(grads.perYear)}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{grads.label}</div>
        </div>
        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">Openings a year</div>
          <div className="font-display mt-1 text-4xl leading-none">~{nf.format(jobs.openingsPerYear)}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {jobs.growthPerYear >= 0
              ? `${nf.format(jobs.growthPerYear)} net new jobs a year (measured) plus ${nf.format(jobs.replacementPerYear)} replacement seats`
              : `a shrinking headcount (${nf.format(jobs.growthPerYear)} a year) offset by ${nf.format(jobs.replacementPerYear)} replacement seats`}
          </div>
        </div>
        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">Seats per graduate</div>
          <div
            className={`font-display mt-1 text-4xl leading-none ${
              band === "comfortable"
                ? "text-emerald-700 dark:text-emerald-400"
                : band === "workable"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-700 dark:text-red-400"
            }`}
          >
            {seats.toFixed(seats >= 10 ? 0 : 1)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            openings per graduate per year. 1.0 means the cohort fits exactly, with no room for anyone else
          </div>
        </div>
      </div>
      <p className="mt-3 border-l-2 border-red-700 pl-3 font-serif text-sm text-slate-600 dark:border-red-500 dark:text-slate-300">
        {verdict}
      </p>
      <p className="mt-2 text-[11px] text-slate-400">
        Graduate numbers: {grads.source}. Openings are measured, not modelled, on one side: the net change in
        national employment across this field&apos;s occupations over the last five years (ABS Labour Force
        Detailed, EQ08, {nf.format(jobs.employed)} currently employed), averaged per year. Replacement seats are
        the stated assumption: 3% of the workforce a year retires or leaves for good. Openings count every
        level, not just entry, and migrants and career changers compete for them too.
      </p>
    </section>
  );
}

export function GradBacklogSection({
  grads,
  months,
  values,
  industryName,
  kicker,
}: {
  grads: GradsConfig;
  months: string[];
  values: number[];
  industryName: string;
  kicker: string;
}) {
  // the backlog machine, same rules as the tech page: a fixed cohort arrives
  // every year, hiring absorbs the pool in proportion to real postings,
  // calibrated so 2006 cleared 75% of its queue. Difficulty is hunters per
  // posting, indexed to 2006 = 1x.
  const GRADS = grads.perYear;
  const yearly: Record<number, number[]> = {};
  months.forEach((m, i) => {
    const y = Number(m.slice(0, 4));
    (yearly[y] = yearly[y] ?? []).push(values[i]);
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
  const maxD = Math.max(...rows.map((r) => r.difficulty));

  const W = 920;
  const H = 320;
  const PAD = { l: 44, r: 66, t: 26, b: 28 };
  const x = (year: number) => PAD.l + ((year - startYear) / (endYear - startYear)) * (W - PAD.l - PAD.r);
  const y = (d: number) => H - PAD.b - (d / (maxD * 1.06)) * (H - PAD.t - PAD.b);
  const linePath = rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(r.year).toFixed(1)},${y(r.difficulty).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(endYear).toFixed(1)},${y(0)} L${x(startYear).toFixed(1)},${y(0)} Z`;
  const gridSteps = maxD > 12 ? [5, 10, 15, 20] : maxD > 4 ? [2, 4, 6, 8, 10] : [1, 2, 3];
  const marks = [
    { year: 2009, label: "GFC" },
    { year: 2020, label: "Lockdowns" },
    { year: 2022, label: "Free money" },
  ];
  const easier = last.difficulty <= 1.15;

  return (
    <section className="mt-12">
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-widest text-red-700 dark:text-red-400">{kicker}</div>
        <h2 className="font-display text-3xl tracking-wide sm:text-4xl">The backlog</h2>
        <p className="mt-1 font-serif text-sm text-slate-600 dark:text-slate-300">
          Every year a new class of {industryName.toLowerCase()} graduates arrives whether the market wants them
          or not, and whoever is not absorbed rolls into next year&apos;s queue. This machine runs on twenty years
          of real posting data and asks: how many times harder is entry than in 2006?
        </p>
      </div>
      <div className="overflow-x-auto border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px]" role="img" aria-label={`How many times harder it is for a ${industryName} graduate to get hired than in 2006, by year`}>
          {gridSteps.filter((g) => g <= maxD).map((g) => (
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
              <title>{`${r.year}: ${r.difficulty.toFixed(1)}x vs 2006 (modelled queue: ${nf.format(r.pool)})`}</title>
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
            {last.difficulty < 3 ? last.difficulty.toFixed(1) : last.difficulty.toFixed(0)}x
          </text>
        </svg>
      </div>
      <p className="mt-3 border-l-2 border-red-700 pl-3 font-serif text-sm text-slate-600 dark:border-red-500 dark:text-slate-300">
        {easier
          ? `By this machine, entry today is about as hard as it was in 2006, which on this site counts as a triumph. The dips are hiring booms clearing the queue.`
          : `By this machine, a graduate applying today faces about ${last.difficulty < 3 ? last.difficulty.toFixed(1) : last.difficulty.toFixed(0)}x the competition of a 2006 graduate. The dips are hiring booms clearing the queue; the climbs are the queue winning.`}
      </p>
      <p className="mt-2 text-[11px] text-slate-400">
        The model: ~{nf.format(GRADS)} graduates arrive each year ({grads.source}); hiring absorbs the pool in
        proportion to real IVI postings, calibrated so 2006 cleared 75% of its queue; nobody ever gives up and
        leaves the field, which is the only optimistic assumption in it. Difficulty is hunters per posting,
        indexed to 2006.
      </p>
    </section>
  );
}
