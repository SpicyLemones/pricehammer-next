// src/app/product/[id]/page.tsx
import { query } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductRow = { id: number; name: string; search_term: string };
type PriceRow = { seller_name: string; price: number | null; link: string | null };

function fmtAUD(n?: number | null) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const product = (await query("get", "select/product_id", [id])) as ProductRow | undefined;
  if (!product) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Not found</h1>
        <p>Product {id} does not exist.</p>
      </div>
    );
  }

  // pull retailer prices
  const prices = (await query("all", "select/display_prices", [product.id])) as PriceRow[];

  // try to merge with manual metadata from src/data/db/Products.ts
  // (Optional — ignore if file not present or structure differs)
  let manual: any = null;
  try {
    const mod = await import("../../../../data/db/Product");
    const { Products } = mod as { Products: Array<any> };
    manual = Products.find((p) => p.id === String(product.id)) || null;
  } catch {}

  //placeholder
  //const image = manual?.image ? `/images/${manual.image}` : "/images/placeholder.png";
  const image = "/images/placeholder.png";
  const faction = manual?.faction ?? "—";
  const game = manual?.game ?? "—";
  const category = manual?.category ?? "—";
  const points = typeof manual?.points === "number" ? manual.points : null;

  return (
    <div className="relative">
      {/* Soft overlay over busy wallpaper for legibility */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10 pointer-events-none
                   bg-gradient-to-b from-black/85 to-white/10
                   dark:from-slate-950/80 dark:to-slate-950/70
                   backdrop-blur-md-100"
      />

      <div className="max-w-4xl mx-auto p-6">
        {/* Opaque panel so text/prices don't fight the background */}
        <div className="space-y-6 rounded-xl border border-slate-200 shadow-lg
                        bg-white/95 dark:bg-slate-900/95
                        supports-[backdrop-filter]:backdrop-blur-sm p-6">

          <div className="flex gap-6 items-start">
            <div className="w-56 h-56 border rounded bg-white dark:bg-slate-950
                            border-slate-200 flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={product.name} className="object-contain w-full h-full" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{product.name}</h1>
              <div className="text-slate-700 dark:text-slate-200 mt-2">
                <div><span className="font-semibold">Game:</span> {game}</div>
                <div><span className="font-semibold">Faction:</span> {faction}</div>
                <div><span className="font-semibold">Category:</span> {category}</div>
                <div><span className="font-semibold">Points:</span> {points ?? "—"}</div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2 text-slate-900 dark:text-slate-100">Retailers</h2>
            {prices?.length ? (
              <div className="rounded-md overflow-hidden border border-slate-200/90
                              divide-y divide-slate-200/90
                              bg-white/95 dark:bg-slate-900/95">
                {prices.map((r, i) => (
                  <div
                    key={i}
                    className="p-3 grid grid-cols-[1fr_auto_auto] items-center gap-3
                               odd:bg-slate-50/70 dark:odd:bg-slate-800/50
                               even:bg-white/95 dark:even:bg-slate-900/95
                               hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="font-medium text-slate-900 dark:text-slate-100">{r.seller_name}</div>
                    <div className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">{fmtAUD(r.price)}</div>
                    <div className="text-right">
                      {r.link ? (
                        <a
                          href={r.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center rounded-md border border-slate-300
                                     px-3 py-1.5 text-sm font-medium
                                     bg-white hover:bg-slate-50
                                     dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700
                                     text-slate-800 dark:text-slate-100"
                        >
                          Visit
                        </a>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-300 text-sm">No link</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-600 dark:text-slate-300">No prices yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
