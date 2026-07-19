// Shared graduate exhibits: the grad index (completions each year against
// graduate-tagged postings right now) and the backlog machine (the tech
// page's compounding-difficulty model, generalised to any industry with a
// grads figure and an IVI series).

const nf = new Intl.NumberFormat("en-AU");

export type GradsConfig = { perYear: number; label: string; source: string };

export type GradIndexStats = {
  monthly: number;
  index: number;
  rank: number;
  of: number;
  median: number;
};

export function GradIndexSection({
  grads,
  stats,
  industryName,
  kicker,
}: {
  grads: GradsConfig;
  stats: GradIndexStats | null;
  industryName: string;
  kicker: string;
}) {
  if (!stats) return null;
  const { monthly, index, rank, of, median } = stats;
  // graduate-tagged ads undercount entry hiring everywhere, so the honest
  // signal is the rank among industries, not the raw ratio
  const tercile = rank <= Math.ceil(of / 3) ? "top" : rank <= Math.ceil((2 * of) / 3) ? "mid" : "bottom";

  let verdict: string;
  if (monthly === 0) {
    verdict = `Zero postings in this slice currently bother saying "graduate" at all. Either entry happens through doors Seek never sees, or it barely happens. Both readings are worth sitting with.`;
  } else if (tercile === "top") {
    verdict = `That ratio ranks ${rank} of ${of} industries on this site, comfortably above the median of ${median.toFixed(2)}. Relative to everyone else's queue, this pipeline works: employers here actually advertise for graduates, in numbers that mean something against the size of the cohort.`;
  } else if (tercile === "mid") {
    verdict = `That ratio ranks ${rank} of ${of} industries on this site, around the median of ${median.toFixed(2)}. Mid-table: the cohort does not walk into work, but it is not a landfill either.`;
  } else {
    verdict = `That ratio ranks ${rank} of ${of} industries on this site, below the median of ${median.toFixed(2)}. Graduate-tagged demand is thin against the size of the cohort, and the backlog chart below shows what that does over twenty years.`;
  }

  return (
    <section className="mt-12">
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-widest text-red-700 dark:text-red-400">{kicker}</div>
        <h2 className="font-display text-3xl tracking-wide sm:text-4xl">The graduating class</h2>
        <p className="mt-1 font-serif text-sm text-slate-600 dark:text-slate-300">
          Two real numbers decide how a {industryName.toLowerCase()} graduate&apos;s first year goes: how many of
          you finish the degree, and how many employers say the word graduate out loud.
        </p>
      </div>
      <div className="grid gap-px border border-slate-300 bg-slate-300 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-3">
        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">New graduates a year</div>
          <div className="font-display mt-1 text-4xl leading-none">~{nf.format(grads.perYear)}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{grads.label}</div>
        </div>
        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">Graduate-tagged postings now</div>
          <div className="font-display mt-1 text-4xl leading-none">{nf.format(monthly)}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            live Seek postings in this slice mentioning &ldquo;graduate&rdquo; (last 31 days)
          </div>
        </div>
        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">Openings per graduate</div>
          <div
            className={`font-display mt-1 text-4xl leading-none ${
              tercile === "top"
                ? "text-emerald-700 dark:text-emerald-400"
                : tercile === "mid"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-700 dark:text-red-400"
            }`}
          >
            {index.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            graduate-tagged openings per graduate per year, ranked {rank} of {of} industries here
          </div>
        </div>
      </div>
      <p className="mt-3 border-l-2 border-red-700 pl-3 font-serif text-sm text-slate-600 dark:border-red-500 dark:text-slate-300">
        {verdict}
      </p>
      <p className="mt-2 text-[11px] text-slate-400">
        Graduate numbers: {grads.source}. The postings count only catches ads that literally say graduate, which
        undercounts entry hiring everywhere, and especially in fields where governments recruit graduates through
        their own portals (teaching, nursing, police). The rank against other industries is the honest signal, not
        the raw number.
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
