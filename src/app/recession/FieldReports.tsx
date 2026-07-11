"use client";

import { useState } from "react";
import type { FunPost } from "@/app/lib/recession";

export function FieldReports({
  funPosts,
  auSubs,
  globalSubs,
  kicker = "Exhibit K",
}: {
  funPosts: FunPost[];
  auSubs: string[];
  globalSubs: string[];
  kicker?: string;
}) {
  const [scope, setScope] = useState<"au" | "global">("au");

  if (!funPosts.length) return null;

  const subs = scope === "au" ? auSubs : globalSubs;
  const inScope = funPosts.filter((p) => subs.includes(p.sub));
  const top = inScope.filter((p) => p.kind === "top").sort(byRank).slice(0, 6);
  const controversial = inScope.filter((p) => p.kind === "controversial").sort(byRank).slice(0, 6);

  return (
    <section className="mt-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-red-700 dark:text-red-400">{kicker}</div>
          <h2 className="font-display text-3xl tracking-wide sm:text-4xl">Field reports from the trenches</h2>
          <p className="mt-1 font-serif text-sm text-slate-600 dark:text-slate-300">
            The biggest and most heated posts on the job subreddits this month. Morale is what it is.
          </p>
        </div>
        <div className="flex border border-slate-300 text-sm dark:border-slate-700">
          {(["au", "global"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-4 py-1.5 uppercase tracking-wider transition-colors ${
                scope === s
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-white text-slate-500 hover:text-slate-900 dark:bg-slate-900 dark:hover:text-slate-100"
              }`}
            >
              {s === "au" ? "Australia" : "Global"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PostColumn heading="Most popular" posts={top} />
        <PostColumn heading="Most controversial" posts={controversial} />
      </div>
    </section>
  );
}

function byRank(a: FunPost, b: FunPost) {
  return a.rank - b.rank || a.sub.localeCompare(b.sub);
}

function PostColumn({ heading, posts }: { heading: string; posts: FunPost[] }) {
  return (
    <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <h3 className="font-display text-xl tracking-wide">{heading}</h3>
      </div>
      {posts.length ? (
        <ol className="divide-y divide-slate-100 dark:divide-slate-800">
          {posts.map((p) => (
            <li key={`${p.sub}-${p.kind}-${p.rank}`} className="px-4 py-3">
              <a
                href={p.link ?? "#"}
                rel="noreferrer"
                target="_blank"
                className="font-serif text-sm leading-snug text-slate-800 hover:underline dark:text-slate-100"
              >
                {p.title ?? "(deleted, which says plenty)"}
              </a>
              <div className="mt-1 text-[11px] text-slate-400">
                r/{p.sub}
                {p.author ? ` · u/${p.author}` : ""}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-4 py-6 text-sm text-slate-500">Nothing collected yet for this scope.</p>
      )}
    </div>
  );
}
