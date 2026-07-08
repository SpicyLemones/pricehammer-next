"use client";

// The money ladder: from a grad's first salary all the way down to the
// richest man on earth, drawn to one scale. One pixel = $50,000, which makes
// the entire Australian pay scale about 800 pixels and Elon Musk twenty
// million. The scrolling IS the visualisation. A skip button exists because
// nobody's wrist deserves that.

import { useRef, useState } from "react";
import type { ReferenceStats } from "@/app/lib/recession";

const DOLLARS_PER_PX = 50_000;

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)} trillion`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)} billion`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}m`;
  return fmtMoney(n);
};

type Rung = { value: number; name: string; emoji: string; note: string; unit: string };

// snark scattered through the twenty million pixels of nothing
const VOID_MARKS: { frac: number; text: string }[] = [
  { frac: 0.002, text: "everyone you have ever met is above this line" },
  { frac: 0.01, text: "1% of the way. the wheel squeaks." },
  { frac: 0.05, text: "5%. a lifetime of the median CEO's pay is behind you." },
  { frac: 0.15, text: "15%. there is nothing down here. there was never anything down here." },
  { frac: 0.3, text: "30%. fun fact: you passed the GDP of several island nations a while ago" },
  { frac: 0.5, text: "halfway. hydrate. stretch the scrolling finger." },
  { frac: 0.7, text: "70%. imagine applying to 400 jobs and then imagine this much money" },
  { frac: 0.85, text: "85%. the money cannot hear you" },
  { frac: 0.97, text: "almost there. it smells like rocket fuel" },
];

export function MoneyLadder({ refStats }: { refStats: ReferenceStats }) {
  const rungs: Rung[] = [
    { value: refStats.medianGradSalary.value, name: "You, a fresh graduate", emoji: "🎓", note: refStats.medianGradSalary.source, unit: "salary/yr" },
    { value: refStats.awote.value, name: "Average full-time worker", emoji: "🧑‍🔧", note: refStats.awote.source, unit: "salary/yr" },
    { value: refStats.pmSalary.value, name: "The Prime Minister", emoji: "🏛️", note: refStats.pmSalary.source, unit: "salary/yr" },
    { value: refStats.medianCeoPay.value, name: "Median ASX100 CEO", emoji: "💼", note: refStats.medianCeoPay.source, unit: "realised pay/yr" },
    { value: refStats.topCeoPay.value, name: refStats.topCeoPay.name ?? "Top CEO", emoji: "👑", note: refStats.topCeoPay.source, unit: "realised pay/yr" },
    { value: refStats.muskNetWorth.value, name: refStats.muskNetWorth.name ?? "Elon Musk", emoji: "🚀", note: refStats.muskNetWorth.source, unit: "total net worth" },
  ].sort((a, b) => a.value - b.value);

  const maxValue = rungs[rungs.length - 1].value;
  const totalHeight = Math.ceil(maxValue / DOLLARS_PER_PX);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(0);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setScrolled(Math.round((el.scrollTop + el.clientHeight) * DOLLARS_PER_PX));
  };

  const skipToEnd = () => {
    scrollRef.current?.scrollTo({ top: totalHeight, behavior: "auto" });
  };

  const done = scrolled >= maxValue;

  // labels for the packed top rungs get staggered so they stay readable
  let lastLabelTop = -60;
  const placed = rungs.map((r) => {
    const lineTop = Math.max(1, Math.round(r.value / DOLLARS_PER_PX));
    const labelTop = Math.max(lineTop, lastLabelTop + 58);
    lastLabelTop = labelTop;
    return { ...r, lineTop, labelTop, offset: labelTop !== lineTop };
  });

  const gradPx = Math.round((rungs[0].value / DOLLARS_PER_PX) * 10) / 10;

  return (
    <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          One pixel = {fmtMoney(DOLLARS_PER_PX)}. At this scale your first salary is about {gradPx} pixels tall
          and the bottom of this ladder is twenty million.
        </span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200">
            scrolled past: {fmtShort(Math.min(scrolled, maxValue))}
            {done ? " — and he made it back while you scrolled" : ""}
          </span>
          <button
            onClick={skipToEnd}
            className="border border-slate-300 px-2 py-1 text-[11px] uppercase tracking-wider text-slate-500 hover:border-slate-500 hover:text-slate-900 dark:border-slate-600 dark:hover:text-slate-100"
          >
            give up, skip to Elon
          </button>
        </div>
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="relative h-[460px] overflow-y-auto">
        <div className="relative" style={{ height: totalHeight + 80 }}>
          {/* the money column */}
          <div
            className="absolute right-4 top-0 w-8 bg-gradient-to-b from-red-200/70 via-red-500/60 to-red-800/90 dark:from-red-400/30 dark:via-red-500/50 dark:to-red-600/90 sm:right-10 sm:w-12"
            style={{ height: totalHeight }}
            aria-hidden
          />
          <div className="absolute right-1 top-1 text-[10px] text-slate-400 sm:right-14">$0 up here</div>

          {/* pay rungs */}
          {placed.map((r, i) => (
            <div key={r.name} className="absolute left-0 right-16 sm:right-24" style={{ top: r.lineTop }}>
              <div className="border-t border-dashed border-slate-400 dark:border-slate-500" style={{ width: `${52 + i * 8}%` }} />
              {r.offset && (
                <div
                  className="absolute left-6 border-l border-dotted border-slate-300 dark:border-slate-600"
                  style={{ height: r.labelTop - r.lineTop }}
                />
              )}
              <div className="absolute left-2 flex items-start gap-2" style={{ top: r.labelTop - r.lineTop + 2 }}>
                <span className="text-2xl leading-none" aria-hidden>{r.emoji}</span>
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-display text-lg leading-none">{r.name}</span>
                    <span className="font-mono text-xs tabular-nums text-red-700 dark:text-red-400">
                      {fmtShort(r.value)} <span className="text-slate-400">({r.unit})</span>
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">{r.note}</div>
                </div>
              </div>
            </div>
          ))}

          {/* void commentary */}
          {VOID_MARKS.map((m) => (
            <div
              key={m.frac}
              className="absolute left-4 right-20 text-xs italic text-slate-400 sm:right-28"
              style={{ top: Math.round(totalHeight * m.frac) }}
            >
              {m.text}
            </div>
          ))}

          {/* the bottom */}
          <div className="absolute inset-x-0 flex items-end justify-between px-4 pb-2" style={{ top: totalHeight - 8, height: 80 }}>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              the bottom of the money. it took {Math.round(maxValue / refStats.medianGradSalary.value).toLocaleString("en-AU")} years
              of your salary to get here, assuming you never ate.
            </div>
            <span className="text-3xl" aria-hidden>🚀</span>
          </div>
        </div>
      </div>
    </div>
  );
}
