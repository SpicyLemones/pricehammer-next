"use client";

// The job leaderboard, two ways: the biggest jobs in the field by how many
// people actually hold them (ABS employment), and the most advertised roles
// right now (live Seek sample). Defaults to the census view; one click flips
// to the live market.

import { useState } from "react";

const nf = new Intl.NumberFormat("en-AU");

export type EmploymentRow = { rank: number; occupation: string; employed: number };
export type PostingRow = { rank: number; role: string; postings: number; sampled: number };

export function RolesToggle({
  employment,
  employmentQuarter,
  postings,
  industryName,
  kicker,
}: {
  employment: EmploymentRow[];
  employmentQuarter: string;
  postings: PostingRow[];
  industryName: string;
  kicker: string;
}) {
  const hasEmployment = employment.length > 0;
  const hasPostings = postings.length > 0;
  const [view, setView] = useState<"employment" | "postings">(hasEmployment ? "employment" : "postings");
  if (!hasEmployment && !hasPostings) return null;

  const sampled = postings[0]?.sampled ?? 0;
  const quarterLabel = new Date(employmentQuarter + "-15").toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  const tab = (key: "employment" | "postings", label: string, enabled: boolean) => (
    <button
      onClick={() => enabled && setView(key)}
      disabled={!enabled}
      className={`border-2 px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors ${
        view === key
          ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
          : enabled
            ? "border-slate-300 text-slate-500 hover:border-slate-900 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-100 dark:hover:text-slate-100"
            : "cursor-not-allowed border-slate-200 text-slate-300 dark:border-slate-800 dark:text-slate-600"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="mt-12">
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-widest text-red-700 dark:text-red-400">{kicker}</div>
        <h2 className="font-display text-3xl tracking-wide sm:text-4xl">The job leaderboard</h2>
        <p className="mt-1 font-serif text-sm text-slate-600 dark:text-slate-300">
          {view === "employment"
            ? `The jobs most of ${industryName.toLowerCase()} actually is: occupations ranked by how many Australians hold them (ABS, ${quarterLabel}).`
            : `The most advertised kinds of ${industryName.toLowerCase()} job right now, counted from a sample of ${nf.format(sampled)} live Seek postings.`}
        </p>
      </div>
      <div className="mb-2 flex gap-2">
        {tab("employment", "Where people work", hasEmployment)}
        {tab("postings", "Advertised right now", hasPostings)}
      </div>
      <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
        {view === "employment" ? (
          <ol className="divide-y divide-slate-100 dark:divide-slate-800">
            {employment.map((r) => {
              const max = Math.max(1, ...employment.map((e) => e.employed));
              return (
                <li key={r.rank} className="flex items-center gap-3 px-4 py-2">
                  <span className="font-mono w-6 shrink-0 text-right text-xs text-slate-400">{r.rank}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-display text-lg leading-none">{r.occupation}</span>
                      <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {nf.format(r.employed)} people
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full bg-emerald-600/70 dark:bg-emerald-400/60"
                        style={{ width: `${(r.employed / max) * 100}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <ol className="divide-y divide-slate-100 dark:divide-slate-800">
            {postings.map((r) => {
              const max = Math.max(1, ...postings.map((p) => p.postings));
              const share = sampled ? Math.round((r.postings / sampled) * 100) : 0;
              return (
                <li key={r.rank} className="flex items-center gap-3 px-4 py-2">
                  <span className="font-mono w-6 shrink-0 text-right text-xs text-slate-400">{r.rank}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-display text-lg leading-none">{r.role}</span>
                      <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {nf.format(r.postings)} posting{r.postings === 1 ? "" : "s"} · {share}% of the sample
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full bg-sky-600/70 dark:bg-sky-400/60"
                        style={{ width: `${(r.postings / max) * 100}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {view === "employment"
          ? "ABS Labour Force Detailed (EQ08), national. The census of the field, updated quarterly."
          : "Seek's own role categories, counted from a live national sample each collector run. Private advertisers count too, since even a mystery employer has to say what the job is."}
      </p>
    </section>
  );
}
