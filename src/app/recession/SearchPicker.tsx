"use client";

// The false search bar: looks like a search engine, secretly a menu of five.
// Type anything, get matched to an industry (or gently told we don't cover
// it), pick a suggestion, hit Go, land on the almanac.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type PickerIndustry = {
  slug: string;
  name: string;
  pickerLine: string;
  searchTerms: string[];
  hiring: boolean;
  indexLabel: string;
  latestValue: number;
};

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

export function SearchPicker({ industries }: { industries: PickerIndustry[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PickerIndustry | null>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // clicking anywhere outside the search bar closes the dropdown
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return industries;
    return industries.filter(
      (ind) =>
        ind.name.toLowerCase().includes(q) ||
        ind.searchTerms.some((t) => t.startsWith(q) || q.startsWith(t) || q.includes(t)),
    );
  }, [query, industries]);

  const go = (ind?: PickerIndustry | null) => {
    const target = ind ?? selected ?? (matches.length === 1 ? matches[0] : null);
    if (target) router.push(`/recession/${target.slug}`);
    else inputRef.current?.focus();
  };

  const choose = (ind: PickerIndustry) => {
    setSelected(ind);
    setQuery(ind.name);
    setOpen(false);
  };

  return (
    <div className="px-6 py-6">
      <div className="relative" ref={rootRef}>
        <div className="flex border-2 border-slate-900 dark:border-slate-100">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search your industry…"
            aria-label="Search your industry"
            className="w-full bg-white px-4 py-3 font-serif text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none dark:bg-slate-950 dark:text-slate-50"
          />
          <button
            onClick={() => go()}
            className="font-display shrink-0 border-l-2 border-slate-900 bg-slate-900 px-6 text-xl tracking-wider text-white transition-colors hover:bg-red-700 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-red-500 dark:hover:text-white"
          >
            Go
          </button>
        </div>

        {open && (
          <div className="absolute inset-x-0 top-full z-10 max-h-72 overflow-y-auto border-2 border-t-0 border-slate-900 bg-white shadow-[6px_6px_0_rgba(0,0,0,0.15)] dark:border-slate-100 dark:bg-slate-950">
            {matches.length ? (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {matches.map((ind) => (
                  <li key={ind.slug}>
                    <button
                      onClick={() => choose(ind)}
                      onDoubleClick={() => go(ind)}
                      className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <span className="font-display text-xl tracking-wide text-slate-900 dark:text-slate-50">
                        {ind.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 font-serif text-sm text-slate-500 dark:text-slate-400">
                No almanac for that one yet. We currently cover{" "}
                {industries.map((i) => i.name).join(", ")}. If your industry is not here, it is either fine
                or beyond help.
              </p>
            )}
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-[11px] uppercase tracking-widest text-slate-400">
        {numberWord(industries.length)} industries indexed · more when the data behaves
      </p>
    </div>
  );
}
