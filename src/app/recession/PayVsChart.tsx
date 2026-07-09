"use client";

// Pay against everything else, over time. Three indexed lines (2006 = 100):
// average full-time pay, consumer prices and the median Sydney house. Click a
// legend entry to spotlight that line against the others.

import { useState } from "react";
import payData from "../../../data/recession/pay-vs-everything.json";

type Point = { year: number; value: number; anchored: boolean };
type SeriesKey = "pay" | "cpi" | "house";

const SERIES: { key: SeriesKey; label: string; end: string; stroke: string; dim: string }[] = [
  { key: "pay", label: "Average full-time pay", end: "1.94x", stroke: "stroke-emerald-600 dark:stroke-emerald-400", dim: "text-emerald-700 dark:text-emerald-400" },
  { key: "cpi", label: "Consumer prices", end: "1.67x", stroke: "stroke-amber-500 dark:stroke-amber-400", dim: "text-amber-600 dark:text-amber-400" },
  { key: "house", label: "Median Sydney house", end: "3.44x", stroke: "stroke-red-700 dark:stroke-red-400", dim: "text-red-700 dark:text-red-400" },
];

const W = 920;
const H = 340;
const PAD = { l: 44, r: 64, t: 20, b: 28 };
const YEAR_MIN = 2006;
const YEAR_MAX = 2026;

export function PayVsChart() {
  const [focus, setFocus] = useState<SeriesKey | null>(null);

  const series = payData.series as Record<SeriesKey, Point[]>;
  const base: Record<SeriesKey, number> = {
    pay: series.pay.find((p) => p.year === YEAR_MIN)!.value,
    cpi: series.cpi.find((p) => p.year === YEAR_MIN)!.value,
    house: series.house.find((p) => p.year === YEAR_MIN)!.value,
  };
  const indexOf = (key: SeriesKey, p: Point) => (p.value / base[key]) * 100;
  const maxIndex = Math.max(
    ...(["pay", "cpi", "house"] as SeriesKey[]).flatMap((k) => series[k].map((p) => indexOf(k, p))),
  );

  const x = (year: number) => PAD.l + ((year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * (W - PAD.l - PAD.r);
  const y = (index: number) => H - PAD.b - ((index - 80) / (maxIndex - 80)) * (H - PAD.t - PAD.b);

  const pathFor = (key: SeriesKey) =>
    series[key].map((p, i) => `${i === 0 ? "M" : "L"}${x(p.year).toFixed(1)},${y(indexOf(key, p)).toFixed(1)}`).join(" ");

  const opacityFor = (key: SeriesKey) => (focus === null || focus === key ? 1 : 0.18);
  const widthFor = (key: SeriesKey) => (focus === key ? 3 : 2);

  return (
    <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <span className="text-[11px] uppercase tracking-widest text-slate-400">Indexed, 2006 = 100</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {SERIES.map((s) => (
            <button
              key={s.key}
              onClick={() => setFocus(focus === s.key ? null : s.key)}
              className={`border px-2.5 py-1 text-xs transition-colors ${
                focus === s.key
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-300 text-slate-600 hover:border-slate-500 dark:border-slate-600 dark:text-slate-300"
              }`}
            >
              <span className={focus === s.key ? "" : s.dim}>■</span> {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px]" role="img" aria-label="Pay, consumer prices and Sydney house prices indexed to 2006">
          {[100, 150, 200, 250, 300, 350].filter((g) => g <= maxIndex + 10).map((g) => (
            <g key={g}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(g) + 3} textAnchor="end" className="fill-slate-400 text-[9px]">{g}</text>
            </g>
          ))}
          {[2006, 2010, 2014, 2018, 2022, 2026].map((yr) => (
            <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[9px]">{yr}</text>
          ))}

          {SERIES.map((s) => {
            const pts = series[s.key];
            const anchoredOnly = pts.filter((p) => p.anchored);
            const dashed = pts.some((p) => !p.anchored) || pts.length <= 6;
            return (
              <g key={s.key} opacity={opacityFor(s.key)} className="transition-opacity duration-200">
                <path
                  d={pathFor(s.key)}
                  fill="none"
                  className={s.stroke}
                  strokeWidth={widthFor(s.key)}
                  strokeDasharray={dashed && pts.length <= 6 ? "5 4" : undefined}
                />
                {anchoredOnly.map((p) => (
                  <circle key={p.year} cx={x(p.year)} cy={y(indexOf(s.key, p))} r={pts.length <= 6 ? 3.5 : 0} className={s.stroke.replace("stroke-", "fill-")}>
                    <title>{`${s.label}, ${p.year}: index ${Math.round(indexOf(s.key, p))}`}</title>
                  </circle>
                ))}
                <text
                  x={x(YEAR_MAX) + 6}
                  y={y(indexOf(s.key, pts[pts.length - 1])) + 3}
                  className="fill-slate-700 text-[11px] font-bold dark:fill-slate-200"
                >
                  {s.end}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="border-t border-slate-200 px-4 py-2 text-[11px] leading-relaxed text-slate-400 dark:border-slate-700">
        {payData.sources.pay} {payData.sources.cpi}. House: {payData.sources.house}.
      </p>
    </div>
  );
}
