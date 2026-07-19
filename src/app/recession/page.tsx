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
    category: ind.category,
    pickerLine: ind.pickerLine,
    searchTerms: ind.searchTerms,
    hiring: ind.hiring,
    indexLabel: ind.indexLabel,
    latestValue: ind.latest.value,
  }));

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* the headline wall: left-anchored rows bleeding off both edges,
          staggered like a movie-poster text wall */}
      <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="font-display whitespace-nowrap text-[11vw] leading-[0.92] text-slate-900/[0.06] dark:text-slate-100/[0.05]"
            style={{ marginLeft: `${-((i * 13) % 34)}vw` }}
          >
            {i % 2 === 0
              ? "THE RECESSION INDICATOR THE RECESSION"
              : "INDICATOR THE RECESSION INDICATOR"}
          </div>
        ))}
      </div>

      {/* the centred box */}
      <div className="relative mx-auto flex min-h-screen w-full max-w-2xl items-center px-4 py-12">
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
            against its own twenty-year typical level and recent momentum. A green light means the line is
            healthy, not that the reasons are.
            <span className="mx-1">·</span>
            <Link href="/" className="underline">spycy.fun</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
