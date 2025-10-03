import type { Metadata } from "next";
import { ProductLookup } from "@/components/ProductLookup";

const pageDescription =
  "Instantly compare Games Workshop prices from Australian retailers, spot stock availability, and find the best Warhammer deals before you buy.";

export const metadata: Metadata = {
  title: "Warhammer Price Comparison in Australia",
  description: pageDescription,
  alternates: {
    canonical: "/warhammer-prices",
  },
  openGraph: {
    title: "Warhammer Price Comparison in Australia | PriceHammer",
    description: pageDescription,
    url: "/warhammer-prices",
  },
  twitter: {
    title: "Warhammer Price Comparison in Australia | PriceHammer",
    description: pageDescription,
  },
};

export default function WarhammerPricesPage() {
  return (
    <div className="space-y-12">
      <section className="space-y-6 text-center sm:text-left">
        <p className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1 text-sm font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
          🇦🇺 Australian Warhammer price tracker
        </p>
        <h1 className="text-4xl font-display font-bold text-slate-900 dark:text-white">
          Find the best Warhammer deals across Australia
        </h1>
        <p className="mx-auto max-w-3xl text-lg text-slate-700 dark:text-slate-300">
          PriceHammer monitors Games Workshop products from trusted Australian hobby stores so you can compare prices, confirm
          stock availability, and build your army for less. Search by product name, faction, or game system to discover the
          cheapest way to expand your collection.
        </p>
        <ul className="mx-auto grid max-w-3xl gap-3 text-left text-slate-700 dark:text-slate-300 sm:grid-cols-2">
          <li className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
            <span className="mt-1 text-emerald-500">✔</span>
            <span>
              Compare live prices for Warhammer 40,000, Age of Sigmar, Kill Team, and more across independent Australian
              retailers.
            </span>
          </li>
          <li className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
            <span className="mt-1 text-emerald-500">✔</span>
            <span>Filter by faction or unit type to quickly surface the products that fit your next army list.</span>
          </li>
          <li className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
            <span className="mt-1 text-emerald-500">✔</span>
            <span>Highlight the lowest AUD price available today and jump directly to the store to secure the deal.</span>
          </li>
          <li className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
            <span className="mt-1 text-emerald-500">✔</span>
            <span>Regular data refreshes keep listings relevant so you never miss a limited stock restock or discount.</span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="lookup-heading" className="space-y-4">
        <div className="space-y-2 text-center sm:text-left">
          <h2 id="lookup-heading" className="text-2xl font-display font-semibold text-slate-900 dark:text-white">
            Search the live price database
          </h2>
          <p className="max-w-2xl text-base text-slate-600 dark:text-slate-300">
            Enter a product name, select a faction, or switch between game systems to surface the best available prices. Sort
            results by featured deals, lowest price, or unit points to plan your next purchase with confidence.
          </p>
        </div>
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
              We track publicly listed prices from leading Australian hobby stores and refresh the listings regularly. Each
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
