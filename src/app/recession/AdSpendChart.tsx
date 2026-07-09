"use client";

// The big spenders: the world's largest advertising budgets that can be
// sourced without a paywall. Ranks and 2022 figures from Ad Age's World's
// Largest Advertisers report as publicly reproduced; the headline entries
// from company annual filings. Logos are each company's own favicon via
// Google's public favicon service, with a monogram fallback.

import { useState } from "react";

type Spender = {
  name: string;
  domain: string;
  billions: number; // USD billions
  note: string;
};

const SPENDERS: Spender[] = [
  { name: "Amazon", domain: "amazon.com", billions: 20.6, note: "2023 10-K, advertising and promotion" },
  { name: "L'Oréal", domain: "loreal.com", billions: 14.0, note: "advertising and promotion, annual report, roughly" },
  { name: "Procter & Gamble", domain: "pg.com", billions: 8.5, note: "fiscal 2024 10-K" },
  { name: "Toyota", domain: "toyota.com", billions: 4.4, note: "Ad Age WLA, 2022 spend" },
  { name: "Coca-Cola", domain: "coca-colacompany.com", billions: 4.32, note: "Ad Age WLA, 2022 spend" },
  { name: "Stellantis", domain: "stellantis.com", billions: 4.3, note: "Ad Age WLA, 2022 spend" },
  { name: "Estée Lauder", domain: "esteelauder.com", billions: 3.91, note: "Ad Age WLA, 2022 spend" },
  { name: "Walmart", domain: "walmart.com", billions: 3.9, note: "Ad Age WLA, 2022 spend" },
  { name: "Nike", domain: "nike.com", billions: 3.8, note: "Ad Age WLA, 2022 spend" },
  { name: "PepsiCo", domain: "pepsico.com", billions: 3.0, note: "Ad Age WLA, 2022 spend" },
  { name: "Netflix", domain: "netflix.com", billions: 2.9, note: "2023 10-K, marketing" },
];

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
      src={`https://www.google.com/s2/favicons?domain=${spender.domain}&sz=64`}
      alt={`${spender.name} logo`}
      width={32}
      height={32}
      className="h-8 w-8 shrink-0 object-contain"
      loading="lazy"
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
          <li key={s.domain} className="flex items-center gap-3 px-4 py-2.5">
            <span className="font-mono w-5 shrink-0 text-xs text-slate-400">{i + 1}</span>
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
      </ol>
    </div>
  );
}
