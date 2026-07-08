"use client";

// The money ladder: every pay packet drawn to the same scale, one pixel per
// $250, and you have to physically scroll through the CEO's pay to reach the
// bottom. The scrolling IS the visualisation.

import { useRef, useState } from "react";
import type { ReferenceStats } from "@/app/lib/recession";

const DOLLARS_PER_PX = 250;

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

export function MoneyLadder({ refStats }: { refStats: ReferenceStats }) {
  const rungs = [
    { value: refStats.medianGradSalary.value, name: "Median grad, day one", note: refStats.medianGradSalary.source },
    { value: refStats.awote.value, name: "Average full-time worker", note: refStats.awote.source },
    { value: refStats.pmSalary.value, name: "The Prime Minister", note: refStats.pmSalary.source },
    { value: refStats.medianCeoPay.value, name: "Median ASX100 CEO", note: refStats.medianCeoPay.source },
    { value: refStats.topCeoPay.value, name: refStats.topCeoPay.name ?? "Top CEO", note: refStats.topCeoPay.source },
  ].sort((a, b) => a.value - b.value);

  const totalHeight = Math.ceil(rungs[rungs.length - 1].value / DOLLARS_PER_PX);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(0);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setScrolled(Math.round((el.scrollTop + el.clientHeight) * DOLLARS_PER_PX));
  };

  const done = scrolled >= rungs[rungs.length - 1].value;

  return (
    <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Drawn to scale: 1 pixel = {fmtMoney(DOLLARS_PER_PX)} of annual pay. Scroll to the bottom of the money.
        </span>
        <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200">
          scrolled past: {fmtMoney(Math.min(scrolled, rungs[rungs.length - 1].value))}
          {done ? " — that took a while, eh" : ""}
        </span>
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="relative h-[420px] overflow-y-auto">
        <div className="relative" style={{ height: totalHeight }}>
          {rungs.map((r, i) => {
            const h = Math.max(2, Math.round(r.value / DOLLARS_PER_PX));
            return (
              <div
                key={r.name}
                className="absolute left-0 border-t border-dashed border-slate-300 dark:border-slate-600"
                style={{ top: h, width: `${58 + i * 9}%` }}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 px-3 pt-1">
                  <span className="font-display text-lg leading-none">{r.name}</span>
                  <span className="font-mono text-xs tabular-nums text-red-700 dark:text-red-400">{fmtMoney(r.value)}</span>
                </div>
                <div className="px-3 text-[10px] text-slate-400">{r.note}</div>
              </div>
            );
          })}
          {/* the pay column itself */}
          <div
            className="absolute right-4 top-0 w-6 bg-gradient-to-b from-red-300/60 to-red-700/90 dark:from-red-400/40 dark:to-red-500/80 sm:right-10 sm:w-10"
            style={{ height: totalHeight }}
            aria-hidden
          />
          <div className="absolute right-1 top-1 text-[10px] text-slate-400 sm:right-14">$0 up here</div>
          <div className="absolute bottom-1 right-1 text-right text-[10px] text-slate-400 sm:right-14">
            the bottom of the money
          </div>
        </div>
      </div>
    </div>
  );
}
