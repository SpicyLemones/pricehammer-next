"use client";

// The application landfill: if every tech application this year were printed
// out and stacked, how high does the pile go? Measured against an escalating
// ladder of objects, from a baby to the ISS. The applications-per-ad
// assumption is a slider because Seek won't publish the real number, only
// that it's at a record high.

import { useEffect, useState } from "react";
import type { ReferenceStats } from "@/app/lib/recession";

const nf = new Intl.NumberFormat("en-AU");

type Landmark = { name: string; emoji: string; metres: number };

const LANDMARKS: Landmark[] = [
  { name: "A baby", emoji: "👶", metres: 0.5 },
  { name: "An adult human", emoji: "🧍", metres: 1.7 },
  { name: "A giraffe", emoji: "🦒", metres: 5.5 },
  { name: "A blue whale, on its tail", emoji: "🐋", metres: 30 },
  { name: "The Sydney Opera House", emoji: "🎭", metres: 65 },
  { name: "Big Ben", emoji: "🕰️", metres: 96 },
  { name: "Eureka Tower", emoji: "🏙️", metres: 297 },
  { name: "The Eiffel Tower", emoji: "🗼", metres: 330 },
  { name: "Burj Khalifa", emoji: "🌆", metres: 828 },
  { name: "Mt Kosciuszko", emoji: "⛰️", metres: 2228 },
  { name: "Mt Everest", emoji: "🏔️", metres: 8849 },
  { name: "Cruising altitude", emoji: "✈️", metres: 11000 },
  { name: "Edge of space (Kármán line)", emoji: "🌌", metres: 100000 },
  { name: "The ISS", emoji: "🛰️", metres: 408000 },
];

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

  // live counter: applications sent so far this calendar year at that rate
  useEffect(() => {
    const perSecond = applicationsPerYear / (365.25 * 86400);
    const startOfYear = Date.UTC(new Date().getUTCFullYear(), 0, 1);
    const update = () => setTicker(Math.floor(((Date.now() - startOfYear) / 1000) * perSecond));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [applicationsPerYear]);

  const cleared = LANDMARKS.filter((l) => l.metres <= stackMetres);
  const notCleared = LANDMARKS.filter((l) => l.metres > stackMetres);
  const bestCleared = cleared[cleared.length - 1];

  return (
    <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-700">
        <p className="font-serif text-lg text-slate-800 dark:text-slate-100">
          If every tech application this year were printed out and stacked, the pile would reach{" "}
          <strong className="text-red-700 dark:text-red-400">{nf.format(stackMetres)} metres</strong> high.
          {bestCleared ? (
            <> That clears {bestCleared.name.toLowerCase()} {bestCleared.emoji}{" "}
            {(Math.round((stackMetres / bestCleared.metres) * 10) / 10).toLocaleString("en-AU")} times over.</>
          ) : null}
        </p>
      </div>

      <div className="grid gap-px bg-slate-300 dark:bg-slate-700 sm:grid-cols-2">
        <Tile big={nf.format(ticker)} small="applications fired into the void this year, and counting" />
        <Tile big={`${nf.format(tonnes)} t`} small="of A4, if anyone had hit print" />
      </div>

      {/* the ladder of things the stack has conquered */}
      <div className="border-t border-slate-200 dark:border-slate-700">
        <ol className="divide-y divide-slate-100 dark:divide-slate-800">
          {[...notCleared].reverse().map((l) => (
            <LandmarkRow key={l.name} l={l} stackMetres={stackMetres} cleared={false} />
          ))}
          <li className="flex items-center gap-3 bg-red-700/10 px-4 py-2.5 dark:bg-red-500/10">
            <span className="text-2xl" aria-hidden>📄</span>
            <div className="flex-1">
              <span className="font-display text-lg tracking-wide text-red-700 dark:text-red-400">
                YOUR STACK: {nf.format(stackMetres)} m
              </span>
              <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400">
                everything below this line has been out-piled
              </span>
            </div>
          </li>
          {[...cleared].reverse().map((l) => (
            <LandmarkRow key={l.name} l={l} stackMetres={stackMetres} cleared />
          ))}
        </ol>
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
            step={50}
            value={perAd}
            onChange={(e) => setPerAd(Number(e.target.value))}
            className="h-1 w-48 accent-red-700 dark:accent-red-500"
          />
          <span className="text-slate-400">{refStats.applicationsPerAd.source}</span>
        </label>
        <p className="mt-2 text-[11px] text-slate-400">
          Maths: {nf.format(adsPerYear)} tech job postings a year (latest IVI month × 12) × {perAd} applications ×{" "}
          {refStats.paperMaths.pagesPerApplication} pages. A ream of {reamSheets} sheets is {reamCm} cm tall and a
          sheet weighs about {refStats.paperMaths.gramsPerSheet} g. Crank the slider if you believe in yourself.
        </p>
      </div>
    </div>
  );
}

function LandmarkRow({ l, stackMetres, cleared }: { l: Landmark; stackMetres: number; cleared: boolean }) {
  const times = stackMetres / l.metres;
  return (
    <li
      className={`flex items-center gap-3 px-4 py-2 ${
        cleared ? "" : "opacity-45"
      }`}
    >
      <span className="text-2xl" aria-hidden>{l.emoji}</span>
      <div className="flex flex-1 flex-wrap items-baseline gap-x-3">
        <span className="text-sm text-slate-800 dark:text-slate-100">{l.name}</span>
        <span className="font-mono text-xs tabular-nums text-slate-400">{nf.format(l.metres)} m</span>
      </div>
      <span className="text-[11px] text-slate-500 dark:text-slate-400">
        {cleared
          ? `cleared ${times >= 2 ? `${Math.floor(times).toLocaleString("en-AU")}x over` : "✓"}`
          : `${Math.max(1, Math.round(1 / times)).toLocaleString("en-AU")}x more paper needed`}
      </span>
    </li>
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
