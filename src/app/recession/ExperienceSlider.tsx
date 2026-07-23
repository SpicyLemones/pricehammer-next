"use client";

// The experience paradox, pick-and-reveal edition: choose your years of
// experience and the pie chart shows how much of the live market is
// actually aimed at you. Hidden until you commit, like a salary band.

import { useState } from "react";

const nf = new Intl.NumberFormat("en-AU");

type BucketKey = "graduate" | "junior" | "mid" | "senior";

type Bucket = {
  key: BucketKey;
  label: string;
  short: string;
  verdict: string;
  colour: string;
  dim: string;
  text: string;
};

const BUCKETS: Bucket[] = [
  {
    key: "graduate",
    label: "None (0 years)",
    short: "Graduate",
    verdict: "Ads that say the word 'graduate'. Most also want two years of experience, which is a fun paradox to sit with.",
    colour: "fill-amber-500",
    dim: "fill-amber-500/25",
    text: "text-amber-600 dark:text-amber-400",
  },
  {
    key: "junior",
    label: "1-2 years",
    short: "Junior",
    verdict: "You now have experience, which disqualifies you from graduate roles and not much else.",
    colour: "fill-sky-500",
    dim: "fill-sky-500/25",
    text: "text-sky-600 dark:text-sky-400",
  },
  {
    key: "mid",
    label: "3-5 years",
    short: "Mid-level",
    verdict: "Ads that name neither junior nor senior. You are the load-bearing middle nobody writes ads for.",
    colour: "fill-slate-500",
    dim: "fill-slate-500/25",
    text: "text-slate-600 dark:text-slate-300",
  },
  {
    key: "senior",
    label: "6+ years",
    short: "Senior",
    verdict: "Congratulations, the market wants you. It only took the better part of a decade to become employable.",
    colour: "fill-emerald-500",
    dim: "fill-emerald-500/25",
    text: "text-emerald-600 dark:text-emerald-400",
  },
];

export function ExperienceSlider({ seekLatest }: { seekLatest: Record<string, number> }) {
  const [picked, setPicked] = useState<BucketKey | null>(null);

  const all = seekLatest["seek-ict-all"] ?? 0;
  const counts: Record<BucketKey, number> = {
    graduate: seekLatest["seek-ict-graduate"] ?? 0,
    junior: seekLatest["seek-ict-junior"] ?? 0,
    senior: seekLatest["seek-ict-senior"] ?? 0,
    mid: Math.max(
      0,
      (seekLatest["seek-ict-all"] ?? 0) -
        (seekLatest["seek-ict-junior"] ?? 0) -
        (seekLatest["seek-ict-senior"] ?? 0) -
        (seekLatest["seek-ict-graduate"] ?? 0),
    ),
  };

  if (!all) {
    return (
      <p className="border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
        The live Seek counts have not been loaded on this deployment yet. The pie wakes up when the data
        collector next delivers. Much like the job market, check back later.
      </p>
    );
  }

  const chosen = BUCKETS.find((b) => b.key === picked) ?? null;
  const share = chosen ? Math.round((counts[chosen.key] / all) * 100) : 0;

  // pie geometry: slices in bucket order, starting at 12 o'clock
  const CX = 130;
  const CY = 130;
  const R = 105;
  let angle = -Math.PI / 2;
  const slices = BUCKETS.map((b) => {
    const frac = counts[b.key] / all;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const mid = (a0 + a1) / 2;
    const path = [
      `M${CX},${CY}`,
      `L${(CX + R * Math.cos(a0)).toFixed(2)},${(CY + R * Math.sin(a0)).toFixed(2)}`,
      `A${R},${R} 0 ${large} 1 ${(CX + R * Math.cos(a1)).toFixed(2)},${(CY + R * Math.sin(a1)).toFixed(2)}`,
      "Z",
    ].join(" ");
    // picked slice slides out along its middle angle
    const off = picked === b.key ? 10 : 0;
    return {
      b,
      frac,
      path,
      dx: off * Math.cos(mid),
      dy: off * Math.sin(mid),
      labelX: CX + R * 0.62 * Math.cos(mid),
      labelY: CY + R * 0.62 * Math.sin(mid),
    };
  });

  return (
    <div className="border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm text-slate-600 dark:text-slate-300">Choose your years of experience:</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            onClick={() => setPicked(b.key)}
            className={`border-2 px-4 py-2 font-display text-lg tracking-wide transition-colors ${
              picked === b.key
                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                : "border-slate-300 hover:border-slate-900 dark:border-slate-700 dark:hover:border-slate-100"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <svg viewBox="0 0 260 260" className="w-56 shrink-0" role="img" aria-label="Share of live tech postings by experience level">
          {picked === null ? (
            <>
              <circle cx={CX} cy={CY} r={R} className="fill-slate-100 dark:fill-slate-800" />
              <circle cx={CX} cy={CY} r={R} fill="none" strokeDasharray="4 6" className="stroke-slate-400" strokeWidth="1.5" />
              <text x={CX} y={CY + 8} textAnchor="middle" className="fill-slate-400 font-display text-2xl">?</text>
            </>
          ) : (
            slices.map((s) => (
              <g key={s.b.key} transform={`translate(${s.dx.toFixed(1)},${s.dy.toFixed(1)})`} className="transition-transform duration-300">
                <path
                  d={s.path}
                  className={`${picked === s.b.key ? s.b.colour : s.b.dim} stroke-white dark:stroke-slate-900`}
                  strokeWidth="2"
                />
                {s.frac > 0.04 && (
                  <text
                    x={s.labelX + s.dx}
                    y={s.labelY + s.dy}
                    textAnchor="middle"
                    className={`text-[11px] font-bold ${picked === s.b.key ? "fill-white" : "fill-slate-500 dark:fill-slate-400"}`}
                  >
                    {Math.round(s.frac * 100)}%
                  </text>
                )}
              </g>
            ))
          )}
        </svg>

        <div className="min-w-0 flex-1">
          {chosen === null ? (
            <p className="font-serif text-sm italic text-slate-500 dark:text-slate-400">
              The market has an opinion about you. It reveals itself when you do.
            </p>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-widest text-slate-400">{chosen.short}</div>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className={`font-display text-5xl leading-none tabular-nums ${chosen.text}`}>
                  {nf.format(counts[chosen.key])}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  of {nf.format(all)} live tech postings ({share}%)
                </span>
              </div>
              <p className="mt-3 font-serif text-sm italic text-slate-600 dark:text-slate-300">{chosen.verdict}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                {BUCKETS.map((b) => (
                  <button key={b.key} onClick={() => setPicked(b.key)} className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:underline dark:text-slate-400">
                    <span className={`inline-block h-2.5 w-2.5 ${b.colour}`.replace("fill-", "bg-")} />
                    {b.short} {Math.round((counts[b.key] / all) * 100)}%
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">
        Live Seek keyword counts, ICT classification, national, last 31 days. Slices are keyword slices, so they
        overlap the way job postings overlap with reality: loosely.
      </p>
    </div>
  );
}
