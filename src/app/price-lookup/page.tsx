import type { Metadata } from "next";
import { ProductLookup } from "@/components/ProductLookup";

const pageDescription =
  "Compare Games Workshop prices from hobby stores with PriceHammer so you can spot stock and savings before checking out.";

export const metadata: Metadata = {
  title: "Warhammer Price Comparison Tool",
  description: pageDescription,
  alternates: {
    canonical: "/price-lookup",
  },
  openGraph: {
    title: "Warhammer Price Comparison Tool | PriceHammer",
    description: pageDescription,
    url: "/price-lookup",
  },
  twitter: {
    title: "Warhammer Price Comparison Tool | PriceHammer",
    description: pageDescription,
  },
};

export default function WarhammerPricesPage() {
  return (
    <div className="space-y-12">
      <section className="space-y-6 text-center sm:text-left">
        <p className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1 text-sm font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
          This Warhammer price tracker is currently only available for Australian 🇦🇺 Retailers! 
        </p>
        <h1 className="text-4xl font-display font-bold text-slate-900 dark:text-white">
          Find the best prices for warhammer and wargaming kits across multiple retailers!
        </h1>
        
        <p className="mx-auto max-w-3xl text-lg text-slate-700 dark:text-slate-300 flex items-start gap-2 rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
          This website monitors Games Workshop products from third party retailers so you can compare prices, check stock,
          and jump on deals before they sell out. More regions will follow once local data is ready.
        </p>
      </section>

      <section aria-labelledby="lookup-heading" className="space-y-4">
        <h2 id="lookup-heading" className="sr-only">
          Warhammer price lookup
        </h2>
        <ProductLookup />
      </section>

      <section aria-labelledby="faq-heading" className="space-y-4">
        <h2 id="faq-heading" className="text-2xl font-display font-semibold text-slate-900 dark:text-white">
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          <details className="group rounded-lg border border-slate-200 bg-white/80 p-4 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
            <summary className="cursor-pointer text-lg font-medium text-slate-800 transition-colors group-open:text-emerald-600 dark:text-slate-200">
              Where do the prices come from?
            </summary>
            <p className="mt-2 text-slate-700 dark:text-slate-300">
              We track publicly listed prices from Australian hobby stores and refresh the listings regularly. Each product
              links directly to the retailer.
            </p>
          </details>
          <details className="group rounded-lg border border-slate-200 bg-white/80 p-4 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
            <summary className="cursor-pointer text-lg font-medium text-slate-800 transition-colors group-open:text-emerald-600 dark:text-slate-200">
              How can I request a store or product to be added?
            </summary>
            <p className="mt-2 text-slate-700 dark:text-slate-300">
              Email me to suggest new retailers or Games Workshop releases. Community feedback helps prioritise the
              next data imports and ensures regional coverage stays accurate.
            </p>
          </details>
          <details className="group rounded-lg border border-slate-200 bg-white/80 p-4 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
            <summary className="cursor-pointer text-lg font-medium text-slate-800 transition-colors group-open:text-emerald-600 dark:text-slate-200">
              I found a broken link/item, what can I do?
            </summary>
            <p className="mt-2 text-slate-700 dark:text-slate-300">
              Email me, or hit the report button! Every report helps!
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}
