// src/app/admin/page.tsx
import { all } from "@/lib/sql";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // remaining unchecked = count of rows from select/count_unsorted.sql
  const unchecked = await all("select/count_unsorted");
  const count = unchecked.length;

  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border rounded-xl p-4 shadow-sm bg-white">
      <h3 className="font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl py-8 px-4 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <div className="text-sm text-slate-600">
          Remaining unchecked prices: <b>{count}</b>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/" className="px-3 py-2 rounded-md bg-slate-900 text-white">Home</Link>
        <Link href="/tinder" className="px-3 py-2 rounded-md bg-slate-900 text-white">Tinder</Link>
        <a href="/api/export" className="px-3 py-2 rounded-md bg-slate-900 text-white">Export Data.ts</a>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card title="Auto-Validate (first hit)">
          <form method="POST" action="/api/auto-validate" className="flex flex-col gap-2">
            <input name="seller" placeholder="Seller ID (optional)" className="border rounded px-3 py-2"/>
            <input name="product" placeholder="Product ID (optional)" className="border rounded px-3 py-2"/>
            <button className="rounded bg-emerald-600 text-white px-3 py-2">Run Auto-Validate</button>
          </form>
        </Card>

        <Card title="Refresh Prices (validated only)">
          <form method="POST" action="/api/refresh-prices" className="flex flex-col gap-2">
            <input name="seller" placeholder="Seller ID (optional)" className="border rounded px-3 py-2"/>
            <button className="rounded bg-sky-600 text-white px-3 py-2">Refresh</button>
          </form>
        </Card>

        <Card title="Seed Rows for New Seller">
          <form method="POST" action="/api/seed/new-seller" className="flex flex-col gap-2">
            <input name="seller" placeholder="Seller ID" required className="border rounded px-3 py-2"/>
            <button className="rounded bg-violet-700 text-white px-3 py-2">Seed Seller Rows</button>
          </form>
        </Card>

        <Card title="Seed Rows for New Product">
          <form method="POST" action="/api/seed/new-product" className="flex flex-col gap-2">
            <input name="product" placeholder="Product ID" required className="border rounded px-3 py-2"/>
            <button className="rounded bg-violet-700 text-white px-3 py-2">Seed Product Rows</button>
          </form>
        </Card>

        <Card title="Import Sellers (JSON)">
          <form method="POST" action="/api/admin/import-sellers-from-json" className="flex gap-2">
            <button className="rounded bg-teal-700 text-white px-3 py-2 w-full">Import & Seed New Sellers</button>
          </form>
        </Card>

        <Card title="Import Products (JSON)">
          <form method="POST" action="/api/admin/import-products-from-json" className="flex gap-2">
            <button className="rounded bg-teal-700 text-white px-3 py-2 w-full">Import & Seed New Products</button>
          </form>
        </Card>

        <Card title="Report Wrong Pair">
          <form method="POST" action="/api/report-wrong" className="flex flex-col gap-2">
            <input name="seller" placeholder="Seller ID" required className="border rounded px-3 py-2"/>
            <input name="product" placeholder="Product ID" required className="border rounded px-3 py-2"/>
            <textarea name="reason" rows={3} placeholder="Reason (optional)" className="border rounded px-3 py-2"/>
            <button className="rounded bg-rose-600 text-white px-3 py-2">Submit Report</button>
          </form>
          <div className="mt-2 text-sm">
            Or <a href="/report-by-link" className="text-blue-600 underline">report by link</a>.
          </div>
        </Card>
      </div>
    </div>
  );
}
