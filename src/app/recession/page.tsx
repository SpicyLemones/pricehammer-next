import type { Metadata } from "next";
import Link from "next/link";
import { getIndustrySummaries } from "@/app/lib/recession-industries";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { SearchPicker } from "./SearchPicker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const pickerDescription = "Your go to hub in doom economics.";

export const metadata: Metadata = {
  title: "The Recession Indicator",
  description: pickerDescription,
  alternates: { canonical: "/recession" },
  openGraph: {
    title: "The Recession Indicator",
    description: pickerDescription,
    url: "/recession",
  },
  twitter: {
    title: "The Recession Indicator",
    description: pickerDescription,
  },
};

export default async function RecessionPickerPage() {
  const industries = await getIndustrySummaries();
  const pickerIndustries = industries.map((ind) => ({
    slug: ind.slug,
    name: ind.name,
    pickerLine: ind.pickerLine,
    searchTerms: ind.searchTerms,
    hiring: ind.hiring,
    indexLabel: ind.indexLabel,
    latestValue: ind.latest.value,
  }));

  return (
    <div className="relative min-h-[85vh] w-full overflow-hidden">
      {/* the giant headline wall behind everything */}
      <div className="pointer-events-none absolute inset-0 flex select-none items-center overflow-hidden" aria-hidden>
        <div className="font-display w-full whitespace-nowrap text-[min(16vw,12.5vh)] leading-[0.85] text-slate-900/[0.06] dark:text-slate-100/[0.05]">
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
                Search your industry.
              </p>
            </div>
            <ThemeToggle />
          </div>

          <SearchPicker industries={pickerIndustries} />

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
