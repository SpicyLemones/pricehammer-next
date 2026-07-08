"use client";

// The application landfill: if every ignored tech application were printed,
// how much paper is that a year? A tipped bin, a mound of crumpled sheets,
// and a live counter. The applications-per-ad assumption is a slider because
// Seek won't publish the real number, only that it's at a record high.

import { useEffect, useState } from "react";
import type { ReferenceStats } from "@/app/lib/recession";

const nf = new Intl.NumberFormat("en-AU");

export function Landfill({
  refStats,
  adsPerYear,
}: {
  refStats: ReferenceStats;
  adsPerYear: number;
}) {
  const [perAd, setPerAd] = useState(refStats.applicationsPerAd.default);
  const [ticker, setTicker] = useState(0);

  const applicationsPerYear = adsPerYear * perAd;
  const sheets = applicationsPerYear * refStats.paperMaths.pagesPerApplication;
  const { sheets: reamSheets, cm: reamCm } = refStats.paperMaths.sheetsPerReamCm;
  const stackMetres = Math.round((sheets / reamSheets) * (reamCm / 100));
  const tonnes = Math.round((sheets * refStats.paperMaths.gramsPerSheet) / 1_000_000);
  const eurekaTowers = Math.round((stackMetres / 297) * 10) / 10; // Eureka Tower, 297 m

  // live counter: applications sent so far this calendar year at that rate
  useEffect(() => {
    const perSecond = applicationsPerYear / (365.25 * 86400);
    const startOfYear = Date.UTC(new Date().getUTCFullYear(), 0, 1);
    const update = () => setTicker(Math.floor(((Date.now() - startOfYear) / 1000) * perSecond));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [applicationsPerYear]);

  // the mound: one paper ball per ~150k sheets, deterministic layout
  const balls = Math.max(6, Math.min(60, Math.round(sheets / 150_000)));
  const mound: { left: number; bottom: number; size: number; rot: number }[] = [];
  for (let i = 0; i < balls; i++) {
    const row = Math.floor(i / 12);
    const inRow = i % 12;
    mound.push({
      left: 8 + inRow * 7.5 + (row % 2) * 3.5 + ((i * 37) % 5) - 2,
      bottom: row * 14 + ((i * 13) % 6),
      size: 16 + ((i * 29) % 10),
      rot: (i * 47) % 360,
    });
  }

  return (
    <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="grid gap-px bg-slate-300 dark:bg-slate-700 sm:grid-cols-3">
        <Tile big={nf.format(ticker)} small="applications fired into the void this year, and counting" />
        <Tile big={`${nf.format(stackMetres)} m`} small={`the printed stack, about ${eurekaTowers} Eureka Towers`} />
        <Tile big={`${nf.format(tonnes)} t`} small="of A4, if anyone had hit print" />
      </div>

      <div className="relative h-44 overflow-hidden border-t border-slate-200 dark:border-slate-700">
        {/* tipped bin */}
        <div className="absolute bottom-3 left-2 origin-bottom-left -rotate-[65deg] text-5xl" aria-hidden>
          🗑️
        </div>
        {/* the mound */}
        <div className="absolute bottom-0 left-16 right-2 h-full" aria-hidden>
          {mound.map((b, i) => (
            <span
              key={i}
              className="landfill-ball absolute select-none text-slate-400 dark:text-slate-500"
              style={{
                left: `${b.left}%`,
                bottom: b.bottom,
                fontSize: b.size,
                transform: `rotate(${b.rot}deg)`,
                animationDelay: `${(i % 10) * 0.18}s`,
              }}
            >
              📄
            </span>
          ))}
        </div>
        <div className="absolute right-2 top-2 max-w-[55%] text-right text-[11px] text-slate-400">
          each sheet in the pile is roughly 150,000 real ones. the bin did not survive
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
        <label className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
          <span>
            assumed applications per ad: <strong className="tabular-nums">{perAd}</strong>
          </span>
          <input
            type="range"
            min={refStats.applicationsPerAd.min}
            max={refStats.applicationsPerAd.max}
            step={10}
            value={perAd}
            onChange={(e) => setPerAd(Number(e.target.value))}
            className="h-1 w-48 accent-red-700 dark:accent-red-500"
          />
          <span className="text-slate-400">{refStats.applicationsPerAd.source}</span>
        </label>
        <p className="mt-2 text-[11px] text-slate-400">
          Maths: {nf.format(adsPerYear)} tech ads a year (latest IVI month × 12) × {perAd} applications ×{" "}
          {refStats.paperMaths.pagesPerApplication} pages. A ream of {refStats.paperMaths.sheetsPerReamCm.sheets}{" "}
          sheets is {refStats.paperMaths.sheetsPerReamCm.cm} cm tall and a sheet weighs about{" "}
          {refStats.paperMaths.gramsPerSheet} g. Nobody prints applications, which is lucky.
        </p>
      </div>
    </div>
  );
}

function Tile({ big, small }: { big: string; small: string }) {
  return (
    <div className="bg-white p-4 dark:bg-slate-900">
      <div className="font-display text-3xl leading-none tabular-nums sm:text-4xl">{big}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{small}</div>
    </div>
  );
}
