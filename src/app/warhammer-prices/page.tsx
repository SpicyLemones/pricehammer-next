import type { Metadata } from "next";
import { ProductLookup } from "@/components/ProductLookup";

const pageDescription =
  "Compare Games Workshop prices with PriceHammer to spot stock availability before buying. Coverage currently focuses on Australian and Oceania retailers.";

export const metadata: Metadata = {
  title: "Warhammer Price Comparison Tool",
  description: pageDescription,
  alternates: {
    canonical: "/warhammer-prices",
  },
  openGraph: {
    title: "Warhammer Price Comparison Tool | PriceHammer",
    description: pageDescription,
    url: "/warhammer-prices",
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
          🇦🇺 Warhammer price tracker (AU/Oceania coverage)
        </p>
        <h1 className="text-4xl font-display font-bold text-slate-900 dark:text-white">
          Find the best Warhammer deals before you buy
        </h1>
        <p className="mx-auto max-w-3xl text-lg text-slate-700 dark:text-slate-300">
          PriceHammer monitors Games Workshop products from trusted hobby stores so you can compare prices and confirm stock
          availability. Current coverage is limited to Australian and Oceania retailers while new regions are prepared.
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
              PriceHammer tracks publicly listed prices from leading hobby stores and refreshes the listings regularly. Each
              product links directly to the retailer so you can verify stock before purchasing.
            </p>
          </details>
          <details className="group rounded-lg border border-slate-200 bg-white/80 p-4 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
            <summary className="cursor-pointer text-lg font-medium text-slate-800 transition-colors group-open:text-emerald-600 dark:text-slate-200">
              How can I request a store or product to be added?
            </summary>
            <p className="mt-2 text-slate-700 dark:text-slate-300">
              Use the contact form to suggest new retailers or Games Workshop releases. Community feedback helps prioritise the
              next data imports and ensures regional coverage stays accurate.
            </p>
          </details>
          <details className="group rounded-lg border border-slate-200 bg-white/80 p-4 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
            <summary className="cursor-pointer text-lg font-medium text-slate-800 transition-colors group-open:text-emerald-600 dark:text-slate-200">
              Will Google show the PriceHammer favicon next crawl?
            </summary>
            <p className="mt-2 text-slate-700 dark:text-slate-300">
              Once Google recrawls the site it will pick up the updated metadata, descriptive URL, and manifest. You can request
              indexing in Google Search Console to speed up the refresh.
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}
