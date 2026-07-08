"use client";

// The experience paradox: drag your years of experience, watch the live Seek
// ad counts tell you what the market thinks of you.

import { useState } from "react";

const nf = new Intl.NumberFormat("en-AU");

type Bracket = {
  label: string;
  countKey: "seek-ict-graduate" | "seek-ict-junior" | "mid" | "seek-ict-senior";
  verdict: string;
};

const BRACKETS: { max: number; b: Bracket }[] = [
  { max: 0, b: { label: "Fresh graduate", countKey: "seek-ict-graduate", verdict: "Ads that say the word 'graduate'. Most also want two years of experience, which is a fun paradox to sit with." } },
  { max: 2, b: { label: "Junior (1–2 years)", countKey: "seek-ict-junior", verdict: "You now have experience, which disqualifies you from graduate roles and not much else." } },
  { max: 5, b: { label: "Mid-level (3–5 years)", countKey: "mid", verdict: "Ads that name neither junior nor senior. You are the load-bearing middle nobody writes ads for." } },
  { max: 10, b: { label: "Senior (6–10 years)", countKey: "seek-ict-senior", verdict: "Congratulations, the market wants you. It only took a decade." } },
  { max: 15, b: { label: "Veteran (10+ years)", countKey: "seek-ict-senior", verdict: "Same senior ads as before, but now recruiters call you 'overqualified' in the rejection." } },
];

export function ExperienceSlider({ seekLatest }: { seekLatest: Record<string, number> }) {
  const [years, setYears] = useState(0);

  const all = seekLatest["seek-ict-all"] ?? 0;
  const counts: Record<Bracket["countKey"], number> = {
    "seek-ict-graduate": seekLatest["seek-ict-graduate"] ?? 0,
    "seek-ict-junior": seekLatest["seek-ict-junior"] ?? 0,
    "seek-ict-senior": seekLatest["seek-ict-senior"] ?? 0,
    mid: Math.max(
      0,
      all - (seekLatest["seek-ict-junior"] ?? 0) - (seekLatest["seek-ict-senior"] ?? 0) - (seekLatest["seek-ict-graduate"] ?? 0),
    ),
  };

  const bracket = (BRACKETS.find((x) => years <= x.max) ?? BRACKETS[BRACKETS.length - 1]).b;
  const count = counts[bracket.countKey];
  const share = all > 0 ? Math.round((count / all) * 100) : 0;

  if (!all) {
    return (
      <p className="border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
        The live Seek counts have not been loaded on this deployment yet. The slider wakes up when the data
        collector next delivers. Much like the job market, check back later.
      </p>
    );
  }

  return (
    <div className="border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <label className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-600 dark:text-slate-300">Years of experience:</span>
        <input
          type="range"
          min={0}
          max={15}
          value={years}
          onChange={(e) => setYears(Number(e.target.value))}
          className="h-1 w-56 accent-red-700 dark:accent-red-500"
        />
        <span className="font-display text-2xl leading-none tabular-nums">{years}{years === 15 ? "+" : ""}</span>
      </label>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[11px] uppercase tracking-widest text-slate-400">{bracket.label}</span>
        <span className="font-display text-5xl leading-none text-red-700 dark:text-red-400 tabular-nums">
          {nf.format(count)}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          of {nf.format(all)} tech job postings on Seek right now ({share}%)
        </span>
      </div>
      <div className="mt-3 h-2 w-full bg-slate-100 dark:bg-slate-800" aria-hidden>
        <div className="h-full bg-red-700/80 dark:bg-red-500/80 transition-all duration-300" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-3 font-serif text-sm italic text-slate-600 dark:text-slate-300">{bracket.verdict}</p>
      <p className="mt-2 text-[11px] text-slate-400">
        Live Seek keyword counts, ICT classification, national, last 31 days. Brackets are keyword slices, so they
        overlap the way job postings overlap with reality: loosely.
      </p>
    </div>
  );
}
