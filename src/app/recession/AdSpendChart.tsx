"use client";

// The big spenders: reported annual advertising budgets from company
// filings, with your salary at the bottom for scale. Logos come from
// clearbit's logo API with a monogram fallback when one fails to load.

import { useState } from "react";

type Spender = {
  name: string;
  domain: string;
  billions: number; // USD billions, latest reported year
  note: string;
};

const SPENDERS: Spender[] = [
  { name: "Amazon", domain: "amazon.com", billions: 20.6, note: "2023 10-K, advertising and promotion" },
  { name: "L'Oréal", domain: "loreal.com", billions: 14.0, note: "advertising and promotion, annual report, roughly" },
  { name: "Procter & Gamble", domain: "pg.com", billions: 8.5, note: "fiscal 2024 10-K" },
  { name: "Coca-Cola", domain: "coca-colacompany.com", billions: 5.0, note: "2023 10-K" },
  { name: "Netflix", domain: "netflix.com", billions: 2.9, note: "2023 10-K, marketing" },
];

const YOU_BILLIONS = 75000 / 1e9 / 0.65; // a grad salary in USD billions, give or take

function Logo({ spender }: { spender: Spender }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center border border-slate-300 text-lg dark:border-slate-600">
        {spender.name[0]}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://logo.clearbit.com/${spender.domain}`}
      alt={`${spender.name} logo`}
      width={32}
      height={32}
      className="h-8 w-8 shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

export function AdSpendChart() {
  const max = SPENDERS[0].billions;

  return (
    <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <ol className="divide-y divide-slate-100 dark:divide-slate-800">
        {SPENDERS.map((s, i) => (
          <li key={s.domain} className="flex items-center gap-3 px-4 py-3">
            <span className="font-mono w-4 shrink-0 text-xs text-slate-400">{i + 1}</span>
            <Logo spender={s} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-display text-lg leading-none">{s.name}</span>
                <span className="font-mono text-xs tabular-nums text-red-700 dark:text-red-400">
                  ~US${s.billions.toFixed(1)}b a year
                </span>
                <span className="text-[10px] text-slate-400">{s.note}</span>
              </div>
              <div className="mt-1.5 h-3 w-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full bg-red-700/80 dark:bg-red-500/80"
                  style={{ width: `${(s.billions / max) * 100}%` }}
                />
              </div>
            </div>
          </li>
        ))}
        <li className="flex items-center gap-3 px-4 py-3">
          <span className="font-mono w-4 shrink-0 text-xs text-slate-400">∞</span>
          <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center border border-slate-300 text-lg dark:border-slate-600">
            🫵
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-display text-lg leading-none">You, a marketing grad</span>
              <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                ~US${(YOU_BILLIONS * 1e9).toLocaleString("en-AU", { maximumFractionDigits: 0 })} a year
              </span>
            </div>
            <div className="mt-1.5 h-3 w-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full w-px bg-slate-400" title="this is your bar. it is one pixel wide out of charity." />
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400">
              your bar is one pixel wide, and that pixel is charity
            </div>
          </div>
        </li>
      </ol>
    </div>
  );
}
