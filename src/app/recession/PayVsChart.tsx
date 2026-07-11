"use client";

// Pay against everything else, over time. Three indexed lines (2006 = 100):
// full-time pay in this industry's own ABS division, consumer prices and the
// median Sydney house. Click a legend entry to spotlight that line.

import { useState } from "react";
import payData from "../../../data/recession/pay-vs-everything.json";

type Point = { year: number; value: number; anchored: boolean };
type SeriesKey = "pay" | "cpi" | "house";

const W = 920;
const H = 340;
const PAD = { l: 44, r: 64, t: 20, b: 28 };
const YEAR_MIN = 2006;
const YEAR_MAX = 2026;

const STYLES: Record<SeriesKey, { stroke: string; dim: string }> = {
  pay: { stroke: "stroke-emerald-600 dark:stroke-emerald-400", dim: "text-emerald-700 dark:text-emerald-400" },
  cpi: { stroke: "stroke-amber-500 dark:stroke-amber-400", dim: "text-amber-600 dark:text-amber-400" },
  house: { stroke: "stroke-red-700 dark:stroke-red-400", dim: "text-red-700 dark:text-red-400" },
};

export function PayVsChart({ industry }: { industry?: string }) {
  const [focus, setFocus] = useState<SeriesKey | null>(null);
  const [mode, setMode] = useState<"index" | "dollars">("index");

  const byIndustry = payData.series.payByIndustry as Record<string, { division: string; points: Point[] }>;
  const industryPay = industry ? byIndustry[industry] : undefined;
  const payPoints: Point[] = industryPay?.points ?? (payData.series.payAll as Point[]);
  const payLabel = industryPay
    ? `Full-time pay, ${industryPay.division}`
    : "Average full-time pay, all industries";

  const series: Record<SeriesKey, Point[]> = {
    pay: payPoints,
    cpi: payData.series.cpi as Point[],
    house: payData.series.house as Point[],
  };

  const base: Record<SeriesKey, number> = {
    pay: series.pay[0].value,
    cpi: series.cpi.find((p) => p.year === YEAR_MIN)!.value,
    house: series.house.find((p) => p.year === YEAR_MIN)!.value,
  };
  const indexOf = (key: SeriesKey, p: Point) => (p.value / base[key]) * 100;
  const endMult = (key: SeriesKey) => {
    const pts = series[key];
    return (pts[pts.length - 1].value / base[key]).toFixed(2) + "x";
  };
  const maxIndex = Math.max(
    ...(["pay", "cpi", "house"] as SeriesKey[]).flatMap((k) => series[k].map((p) => indexOf(k, p))),
  );

  const x = (year: number) => PAD.l + ((year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * (W - PAD.l - PAD.r);
  const y = (index: number) => H - PAD.b - ((index - 80) / (maxIndex - 80)) * (H - PAD.t - PAD.b);

  const pathFor = (key: SeriesKey) =>
    series[key].map((p, i) => `${i === 0 ? "M" : "L"}${x(p.year).toFixed(1)},${y(indexOf(key, p)).toFixed(1)}`).join(" ");

  const LEGEND: { key: SeriesKey; label: string }[] = [
    { key: "pay", label: payLabel },
    { key: "cpi", label: "Consumer prices" },
    { key: "house", label: "Median Sydney house" },
  ];

  const opacityFor = (key: SeriesKey) => (focus === null || focus === key ? 1 : 0.18);
  const widthFor = (key: SeriesKey) => (focus === key ? 3 : 2);

  // dollars mode: the pay line alone, as actual annual pay (weekly x 52)
  const annual = (p: Point) => p.value * 52;
  const dollarMax = Math.max(...series.pay.map(annual));
  const dollarMin = Math.min(...series.pay.map(annual));
  const yDollar = (v: number) =>
    H - PAD.b - ((v - dollarMin * 0.9) / (dollarMax - dollarMin * 0.9)) * (H - PAD.t - PAD.b);
  const dollarPath = series.pay
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.year).toFixed(1)},${yDollar(annual(p)).toFixed(1)}`)
    .join(" ");
  const fmtK = (v: number) => `$${Math.round(v / 1000)}k`;

  return (
    <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <div className="flex border border-slate-300 dark:border-slate-600">
          {(["index", "dollars"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors ${
                mode === m
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              {m === "index" ? "indexed, 2006 = 100" : "actual pay, $/yr"}
            </button>
          ))}
        </div>
        {mode === "index" && (
          <div className="ml-auto flex flex-wrap gap-2">
            {LEGEND.map((s) => (
              <button
                key={s.key}
                onClick={() => setFocus(focus === s.key ? null : s.key)}
                className={`border px-2.5 py-1 text-xs transition-colors ${
                  focus === s.key
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-300 text-slate-600 hover:border-slate-500 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                <span className={focus === s.key ? "" : STYLES[s.key].dim}>■</span> {s.label}
              </button>
            ))}
          </div>
        )}
        {mode === "dollars" && (
          <span className="ml-auto text-[11px] uppercase tracking-widest text-slate-400">{payLabel}</span>
        )}
      </div>
      <div className="overflow-x-auto p-2">
        {mode === "index" ? (
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

            {(["pay", "cpi", "house"] as SeriesKey[]).map((key) => {
              const pts = series[key];
              const sparse = pts.length <= 6;
              return (
                <g key={key} opacity={opacityFor(key)} className="transition-opacity duration-200">
                  <path
                    d={pathFor(key)}
                    fill="none"
                    className={STYLES[key].stroke}
                    strokeWidth={widthFor(key)}
                    strokeDasharray={sparse ? "5 4" : undefined}
                  />
                  {sparse &&
                    pts.filter((p) => p.anchored).map((p) => (
                      <circle key={p.year} cx={x(p.year)} cy={y(indexOf(key, p))} r={3.5} className={STYLES[key].stroke.replace(/stroke-/g, "fill-")}>
                        <title>{`${p.year}: index ${Math.round(indexOf(key, p))}`}</title>
                      </circle>
                    ))}
                  <text
                    x={x(YEAR_MAX) + 6}
                    y={y(indexOf(key, pts[pts.length - 1])) + 3}
                    className="fill-slate-700 text-[11px] font-bold dark:fill-slate-200"
                  >
                    {endMult(key)}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px]" role="img" aria-label="Actual full-time annual pay by year">
            {[60000, 80000, 100000, 120000, 140000].filter((g) => g >= dollarMin * 0.9 && g <= dollarMax * 1.05).map((g) => (
              <g key={g}>
                <line x1={PAD.l} x2={W - PAD.r} y1={yDollar(g)} y2={yDollar(g)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
                <text x={PAD.l - 6} y={yDollar(g) + 3} textAnchor="end" className="fill-slate-400 text-[9px]">{fmtK(g)}</text>
              </g>
            ))}
            {[2006, 2010, 2014, 2018, 2022, 2026].map((yr) => (
              <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[9px]">{yr}</text>
            ))}
            <path d={dollarPath} fill="none" className={STYLES.pay.stroke} strokeWidth={2.5} />
            {series.pay.map((p) => (
              <circle key={p.year} cx={x(p.year)} cy={yDollar(annual(p))} r={2.5} className={STYLES.pay.stroke.replace(/stroke-/g, "fill-")}>
                <title>{`${p.year}: ${fmtK(annual(p))} a year`}</title>
              </circle>
            ))}
            <text x={x(YEAR_MIN) + 6} y={yDollar(annual(series.pay[0])) - 8} className="fill-slate-700 text-[11px] font-bold dark:fill-slate-200">
              {fmtK(annual(series.pay[0]))}
            </text>
            <text x={x(YEAR_MAX) - 4} y={yDollar(annual(series.pay[series.pay.length - 1])) - 8} textAnchor="end" className="fill-slate-700 text-[11px] font-bold dark:fill-slate-200">
              {fmtK(annual(series.pay[series.pay.length - 1]))}
            </text>
          </svg>
        )}
      </div>
      <p className="border-t border-slate-200 px-4 py-2 text-[11px] leading-relaxed text-slate-400 dark:border-slate-700">
        Pay: {payData.sources.pay}
        {industryPay ? `, division: ${industryPay.division}` : ""}. Prices: {payData.sources.cpi}. House:{" "}
        {payData.sources.house}. The dollar view is the ABS weekly figure annualised (×52), full-time adult
        ordinary time earnings, before tax.
      </p>
    </div>
  );
}
