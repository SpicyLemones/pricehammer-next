"use client";

// The money ladder: from a grad's first salary at the bottom to the richest
// man on earth at the top. The human zone at the bottom is spaced so you can
// actually read it (log-ish, out of mercy); above the last CEO the scale
// stretches into a hundred-thousand-pixel climb to a trillion dollars. You
// start at the bottom, because of course you do, and scroll up.
//
// Positions come from piecewise log interpolation over anchor points, and the
// "climbed past" counter inverts the same mapping, so the dollar readout is
// exact for this scale even though the scale itself is not linear.

import { useEffect, useRef, useState } from "react";
import type { ReferenceStats } from "@/app/lib/recession";

const TOTAL_HEIGHT = 100_000; // px, bottom of ladder to Musk
const PX_PER_LN = 250; // px per log unit in the human zone: every gap is proportional to its ratio
const MIN_GAP = 80; // px floor so adjacent labels never collide
const BOTTOM_PAD = 90; // px under the grad rung for the "$0" note
const TOP_PAD = 84; // px above the Musk rung so his label and the summit note don't collide

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)} trillion`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)} billion`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}m`;
  return fmtMoney(n);
};

type Rung = { value: number; name: string; emoji: string; note: string; unit: string };

// milestones through the void, placed by dollar value so they stay honest
const VOID_MARKS: { value: number; text: string }[] = [
  { value: 100e6, text: "$100 million. the job postings never mention this bracket." },
  { value: 500e6, text: "$500 million. the wheel squeaks." },
  { value: 1e9, text: "$1 billion. congratulations, you are one thousandth of the way up one guy." },
  { value: 5e9, text: "$5 billion. there is nothing up here. there was never anything up here." },
  { value: 20e9, text: "$20 billion. somewhere around here you pass every Australian rich-lister" },
  { value: 100e9, text: "$100 billion. from here on, billions are a rounding error." },
  { value: 300e9, text: "$300 billion. imagine applying to 400 jobs and then imagine this much money" },
  { value: 500e9, text: "$500 billion. half the money is still above you. it does not feel like it." },
  { value: 750e9, text: "$750 billion. the money cannot hear you" },
  { value: 950e9, text: "almost there. it smells like rocket fuel" },
];

export function MoneyLadder({ refStats }: { refStats: ReferenceStats }) {
  const rungs: Rung[] = [
    { value: refStats.medianGradSalary.value, name: "You, a fresh graduate", emoji: "🎓", note: refStats.medianGradSalary.source, unit: "salary/yr" },
    { value: refStats.awote.value, name: "Average full-time worker", emoji: "🧑‍🔧", note: refStats.awote.source, unit: "salary/yr" },
    { value: 160_000, name: "Senior software engineer", emoji: "💻", note: "Hays / Seek salary guides, ballpark", unit: "salary/yr" },
    { value: 250_000, name: "Your GP", emoji: "🩺", note: "ATO taxation statistics, general practitioners, ballpark", unit: "salary/yr" },
    { value: 460_000, name: "Surgeon", emoji: "🔪", note: "ATO taxation statistics: the country's top-paid occupation", unit: "salary/yr" },
    { value: refStats.pmSalary.value, name: "The Prime Minister", emoji: "🏛️", note: refStats.pmSalary.source, unit: "salary/yr" },
    { value: refStats.medianCeoPay.value, name: "Median ASX100 CEO", emoji: "💼", note: refStats.medianCeoPay.source, unit: "realised pay/yr" },
    { value: refStats.topCeoPay.value, name: refStats.topCeoPay.name ?? "Top CEO", emoji: "👑", note: refStats.topCeoPay.source, unit: "realised pay/yr" },
    { value: refStats.muskNetWorth.value, name: refStats.muskNetWorth.name ?? "Elon Musk", emoji: "🚀", note: refStats.muskNetWorth.source, unit: "total net worth" },
  ].sort((a, b) => a.value - b.value);

  // anchor points (value, heightFromBottom): the human zone is spaced by the
  // log of each jump, so a 6.7x leap (PM to median CEO) reads visibly bigger
  // than a 1.4x one, then one long stretched segment up to the top
  const humanRungs = rungs.slice(0, -1);
  const top = rungs[rungs.length - 1];
  let cursor = BOTTOM_PAD + 80;
  const anchors: { value: number; y: number }[] = humanRungs.map((r, i) => {
    if (i > 0) {
      const gap = Math.log(r.value / humanRungs[i - 1].value) * PX_PER_LN;
      cursor += Math.max(MIN_GAP, Math.round(gap));
    }
    return { value: r.value, y: cursor };
  });
  anchors.unshift({ value: rungs[0].value / 10, y: 8 }); // near-zero baseline
  anchors.push({ value: top.value, y: TOTAL_HEIGHT });

  // piecewise log interpolation: value -> height from bottom
  const yFor = (value: number) => {
    const v = Math.max(anchors[0].value, Math.min(value, top.value));
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      if (v <= b.value) {
        const f = (Math.log(v) - Math.log(a.value)) / (Math.log(b.value) - Math.log(a.value));
        return a.y + f * (b.y - a.y);
      }
    }
    return TOTAL_HEIGHT;
  };
  // inverse: height from bottom -> value, for the counter
  const valueFor = (y: number) => {
    const yy = Math.max(anchors[0].y, Math.min(y, TOTAL_HEIGHT));
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      if (yy <= b.y) {
        const f = (yy - a.y) / (b.y - a.y);
        return Math.exp(Math.log(a.value) + f * (Math.log(b.value) - Math.log(a.value)));
      }
    }
    return top.value;
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(0);

  const readScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // height-from-bottom of the viewport's top edge
    const yTop = el.scrollHeight - el.scrollTop;
    setSeen(Math.round(valueFor(yTop)));
  };

  // start at the bottom, with the grads, where you live
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      readScroll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skipToElon = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  };

  const done = seen >= top.value * 0.999;

  return (
    <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Every gap is drawn to the size of the jump: doubling your pay moves you the same distance whether
          you are a grad or a surgeon. Above Victor, the climb to {fmtShort(top.value)} is{" "}
          {Math.round((TOTAL_HEIGHT - yFor(rungs[rungs.length - 2].value)) / 1000)}k pixels. Scroll up.
        </span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200">
            climbed past: {fmtShort(Math.min(seen, top.value))}
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
      <div ref={scrollRef} onScroll={readScroll} className="relative h-[460px] overflow-y-auto">
        <div className="relative" style={{ height: TOP_PAD + TOTAL_HEIGHT + BOTTOM_PAD }}>
          {/* the money column, on the left, green at your end and red at his */}
          <div
            className="absolute left-3 w-8 bg-gradient-to-t from-emerald-500/80 via-amber-500/70 to-red-600/90 dark:from-emerald-400/60 dark:via-amber-400/50 dark:to-red-500/80 sm:left-5 sm:w-12"
            style={{ top: TOP_PAD, height: TOTAL_HEIGHT }}
            aria-hidden
          />

          {/* rungs: tick on the bar, text directly beside it */}
          {rungs.map((r) => {
            const topPx = TOP_PAD + TOTAL_HEIGHT - yFor(r.value);
            return (
              <div key={r.name}>
                <div
                  className="absolute left-3 h-0 w-12 border-t-2 border-slate-700 dark:border-slate-200 sm:left-5 sm:w-16"
                  style={{ top: topPx }}
                />
                <div className="absolute left-16 flex items-start gap-2 sm:left-[5.5rem]" style={{ top: topPx - 10 }}>
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
            );
          })}

          {/* milestones through the void, placed by dollar value */}
          {VOID_MARKS.map((m) => (
            <div
              key={m.value}
              className="absolute left-16 right-4 text-xs italic text-slate-400 sm:left-[5.5rem]"
              style={{ top: TOP_PAD + TOTAL_HEIGHT - yFor(m.value) }}
            >
              {m.text}
            </div>
          ))}

          {/* the pixel-halfway gut punch */}
          <div
            className="absolute left-16 right-4 text-xs italic text-slate-400 sm:left-[5.5rem]"
            style={{ top: TOP_PAD + Math.round(TOTAL_HEIGHT / 2) }}
          >
            halfway up the ladder. you have covered {fmtShort(valueFor(TOTAL_HEIGHT / 2))} of the{" "}
            {fmtShort(top.value)}. hydrate. stretch the scrolling finger.
          </div>

          {/* the summit note, in the padding above the Musk rung */}
          <div className="absolute left-16 top-2 right-4 sm:left-[5.5rem]">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              the top of the money. {Math.round(top.value / refStats.medianGradSalary.value).toLocaleString("en-AU")} years
              of your salary, assuming you never ate.
            </span>
          </div>

          {/* the bottom, where you start */}
          <div className="absolute left-16 sm:left-[5.5rem]" style={{ top: TOP_PAD + TOTAL_HEIGHT + 20 }}>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              $0. you are here. the only way is up, technically.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
