import type { Metadata } from "next";
import Link from "next/link";
import { getIndustrySummaries } from "@/app/lib/recession-industries";
import { ThemeToggle } from "@/app/components/ThemeToggle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "The Recession Indicator",
  description:
    "Pick your industry and find out how cooked it is. Real job posting data, graduate odds and dark humour for the Australian job market.",
  alternates: { canonical: "/recession" },
};

const nf = new Intl.NumberFormat("en-AU");

export default async function RecessionPickerPage() {
  const industries = await getIndustrySummaries();

  return (
    <div className="relative min-h-[85vh] w-full overflow-hidden">
      {/* the giant headline wall behind everything */}
      <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden>
        <div className="font-display whitespace-nowrap text-[16vw] leading-[0.85] text-slate-900/[0.06] dark:text-slate-100/[0.05]">
          THE RECESSION<br />
          INDICATOR<br />
          THE RECESSION<br />
          INDICATOR<br />
          THE RECESSION<br />
          INDICATOR
        </div>
      </div>

      {/* the centred box */}
      <div className="relative mx-auto flex min-h-[85vh] w-full max-w-2xl items-center px-4 py-12">
        <div className="w-full border-2 border-slate-900 bg-white/95 shadow-[8px_8px_0_rgba(0,0,0,0.15)] backdrop-blur-sm dark:border-slate-100 dark:bg-slate-950/95 dark:shadow-[8px_8px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center justify-between border-b-4 border-double border-slate-900 px-6 py-4 dark:border-slate-100">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Australia · updated whenever it gets worse
              </div>
              <h1 className="font-display mt-1 text-4xl leading-none tracking-wide text-slate-900 dark:text-slate-50 sm:text-5xl">
                The Recession Indicator
              </h1>
              <p className="mt-1 font-serif text-sm italic text-slate-600 dark:text-slate-300">
                Pick your industry. Find out how cooked it is.
              </p>
            </div>
            <ThemeToggle />
          </div>

          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {industries.map((ind) => (
              <li key={ind.slug}>
                <Link
                  href={`/recession/${ind.slug}`}
                  className="group flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                >
                  <div>
                    <div className="font-display text-2xl tracking-wide text-slate-900 group-hover:underline dark:text-slate-50">
                      {ind.name}
                    </div>
                    <div className="font-serif text-sm text-slate-500 dark:text-slate-400">{ind.pickerLine}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {nf.format(ind.latest.value)} postings a month · {ind.vsPeakPct}% vs peak
                    </div>
                  </div>
                  <span
                    className={`font-display shrink-0 text-xl tracking-wider ${
                      ind.hiring
                        ? "reading-hiring text-emerald-600 dark:text-emerald-400"
                        : "text-red-700 dark:text-red-400"
                    }`}
                  >
                    {ind.hiring ? "HIRING" : ind.indexLabel}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="border-t border-slate-200 px-6 py-3 text-[11px] leading-relaxed text-slate-400 dark:border-slate-800">
            Readings come from twenty years of Jobs and Skills Australia vacancy data, each industry judged
            against its own all-time peak. A green light means the line is healthy, not that the reasons are.
            <span className="mx-1">·</span>
            <Link href="/" className="underline">spycy.fun</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
