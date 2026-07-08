"use client";

// The money ladder: from a grad's first salary at the bottom to the richest
// man on earth at the top, drawn to one scale. One pixel = $50,000, which
// makes the entire Australian pay scale about 800 pixels and Elon Musk twenty
// million. You start at the bottom, because of course you do, and scroll up.
// A skip button exists because nobody's wrist deserves that.

import { useEffect, useRef, useState } from "react";
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

// snark scattered through the twenty million pixels of nothing (frac = share
// of Musk's pile, from the bottom)
const VOID_MARKS: { frac: number; text: string }[] = [
  { frac: 0.002, text: "everyone you have ever met is below this line" },
  { frac: 0.01, text: "1% of the way up. the wheel squeaks." },
  { frac: 0.05, text: "5%. a lifetime of the median CEO's pay is already beneath you." },
  { frac: 0.15, text: "15%. there is nothing up here. there was never anything up here." },
  { frac: 0.3, text: "30%. you passed the GDP of several island nations a while ago" },
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
  const [seen, setSeen] = useState(0);

  // start at the bottom, with the grads, where you live
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      setSeen(Math.round((el.scrollHeight - el.scrollTop) * DOLLARS_PER_PX));
    }
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // dollars between the bottom of the ladder and the top of the viewport
    setSeen(Math.round((el.scrollHeight - el.scrollTop) * DOLLARS_PER_PX));
  };

  const skipToElon = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  };

  const done = seen >= maxValue;

  //heights measured from the BOTTOM; labels stagger upwards so the packed
  // human zone at the bottom stays readable
  let lastLabelTop = totalHeight + 64;
  const placed = rungs.map((r) => {
    const lineTop = totalHeight - Math.max(1, Math.round(r.value / DOLLARS_PER_PX));
    const labelTop = Math.min(lineTop, lastLabelTop - 60);
    lastLabelTop = labelTop;
    return { ...r, lineTop, labelTop, offset: labelTop !== lineTop };
  });

  const gradPx = Math.round((rungs[0].value / DOLLARS_PER_PX) * 10) / 10;

  return (
    <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          One pixel = {fmtMoney(DOLLARS_PER_PX)}. Your first salary is about {gradPx} pixels of this ladder.
          The top is twenty million away. Scroll up.
        </span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200">
            climbed past: {fmtShort(Math.max(0, Math.min(seen, maxValue)))}
            {done ? " — and he made it back while you scrolled" : ""}
          </span>
          <button
            onClick={skipToElon}
            className="border border-slate-300 px-2 py-1 text-[11px] uppercase tracking-wider text-slate-500 hover:border-slate-500 hover:text-slate-900 dark:border-slate-600 dark:hover:text-slate-100"
          >
            give up, skip to Elon
          </button>
        </div>
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="relative h-[460px] overflow-y-auto">
        <div className="relative" style={{ height: totalHeight + 90 }}>
          {/* the money column, on the left, green at your end and red at his */}
          <div
            className="absolute left-3 top-0 w-8 bg-gradient-to-t from-emerald-500/80 via-amber-500/70 to-red-600/90 dark:from-emerald-400/60 dark:via-amber-400/50 dark:to-red-500/80 sm:left-5 sm:w-12"
            style={{ height: totalHeight }}
            aria-hidden
          />

          {/* the top */}
          <div className="absolute left-16 top-2 sm:left-24">
            <div className="flex items-center gap-2">
              <span className="text-3xl" aria-hidden>🚀</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                the top of the money. {Math.round(maxValue / refStats.medianGradSalary.value).toLocaleString("en-AU")} years
                of your salary, assuming you never ate.
              </span>
            </div>
          </div>

          {/* pay rungs: tick on the bar, text directly beside it */}
          {placed.map((r) => (
            <div key={r.name}>
              <div
                className="absolute left-3 h-0 w-12 border-t-2 border-slate-700 dark:border-slate-200 sm:left-5 sm:w-16"
                style={{ top: r.lineTop }}
              />
              {r.offset && (
                <div
                  className="absolute left-14 border-l border-dotted border-slate-400 dark:border-slate-500 sm:left-20"
                  style={{ top: r.labelTop + 10, height: r.lineTop - r.labelTop - 8 }}
                />
              )}
              <div className="absolute left-16 flex items-start gap-2 sm:left-24" style={{ top: r.labelTop - 8 }}>
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
              className="absolute left-16 right-4 text-xs italic text-slate-400 sm:left-24"
              style={{ top: Math.round(totalHeight * (1 - m.frac)) }}
            >
              {m.text}
            </div>
          ))}

          {/* the bottom, where you start */}
          <div className="absolute left-16 sm:left-24" style={{ top: totalHeight + 14 }}>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              $0. you are here. the only way is up, technically.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
