"use client";

// Weekly trend of the collected Seek counts for one industry. Click or
// hover a week to see the numbers as they stood then, against today.

import { useState } from "react";
import Link from "next/link";

type Point = { day: string; value: number };

const nf = new Intl.NumberFormat("en-AU");
const W = 640;
const H = 180;
const PAD = { l: 8, r: 8, t: 14, b: 22 };

function dayLabel(day: string, withYear = true) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function pctText(from: number, to: number) {
  if (from <= 0) return "";
  const pct = ((to - from) / from) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`;
}

export function SeekTrend({
  all,
  graduate,
  label,
}: {
  all: Point[];
  graduate: Point[];
  label: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);

  if (all.length < 2) {
    return (
      <p className="mt-3 border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {all.length === 1
          ? `Tracking started ${dayLabel(all[0].day)}. The trend line appears after the next weekly collection.`
          : "No weekly history collected yet."}{" "}
        <Link href="/recession/history" className="underline">
          All industries over time
        </Link>
      </p>
    );
  }

  const values = all.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  // leave headroom so a flat line sits mid-chart, not on an edge
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;
  const t0 = Date.parse(all[0].day);
  const t1 = Date.parse(all[all.length - 1].day);
  const x = (day: string) => PAD.l + ((Date.parse(day) - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const path = all.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  const latest = all[all.length - 1];
  const idx = picked ?? all.length - 1;
  const shown = all[idx];
  const isLatest = idx === all.length - 1;
  const gradAt = [...graduate].reverse().find((g) => g.day <= shown.day);

  return (
    <div className="mt-3 border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
            {isLatest ? "Latest reading" : "As it was"} · {dayLabel(shown.day)}
          </div>
          <div className="font-display text-3xl leading-none">
            {nf.format(shown.value)}
            <span className="ml-2 font-serif text-sm normal-case tracking-normal text-slate-500 dark:text-slate-400">{label}</span>
          </div>
        </div>
        <div className="text-right font-serif text-xs text-slate-600 dark:text-slate-300">
          {isLatest ? (
            <>
              {pctText(all[0].value, latest.value)} since tracking began ({dayLabel(all[0].day)})
            </>
          ) : (
            <>
              Now {nf.format(latest.value)} ({pctText(shown.value, latest.value)} since then)
            </>
          )}
          {gradAt && <div>{nf.format(gradAt.value)} mentioning “graduate”</div>}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`${label}: ${nf.format(all[0].value)} on ${dayLabel(all[0].day)} to ${nf.format(latest.value)} on ${dayLabel(latest.day)}`}
        onMouseLeave={() => setPicked(null)}
      >
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-slate-300 dark:stroke-slate-700" />
        <path d={path} fill="none" strokeWidth={2} className="stroke-red-700 dark:stroke-red-400" strokeLinejoin="round" />
        {all.map((p, i) => (
          <g key={p.day}>
            <circle
              cx={x(p.day)}
              cy={y(p.value)}
              r={i === idx ? 5 : 2.5}
              className={i === idx ? "fill-red-700 dark:fill-red-400" : "fill-slate-500 dark:fill-slate-400"}
            />
            {/* generous invisible hit target per week */}
            <rect
              x={x(p.day) - Math.max(6, (W - PAD.l - PAD.r) / all.length / 2)}
              y={0}
              width={Math.max(12, (W - PAD.l - PAD.r) / all.length)}
              height={H}
              fill="transparent"
              onMouseEnter={() => setPicked(i)}
              onClick={() => setPicked(i)}
            />
          </g>
        ))}
        <text x={PAD.l} y={H - 6} className="fill-slate-500 text-[11px] dark:fill-slate-400">
          {dayLabel(all[0].day)}
        </text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="fill-slate-500 text-[11px] dark:fill-slate-400">
          {dayLabel(latest.day)}
        </text>
      </svg>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span>One point per week, collected from Seek. Hover or tap a point to go back to that week.</span>
        <Link href="/recession/history" className="underline">
          All industries over time
        </Link>
      </div>
    </div>
  );
}
