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
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex gap-6 items-start">
        <div className="w-56 h-56 border rounded bg-white flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={product.name} className="object-contain w-full h-full" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          <div className="text-slate-600 mt-2">
            <div><span className="font-semibold">Game:</span> {game}</div>
            <div><span className="font-semibold">Faction:</span> {faction}</div>
            <div><span className="font-semibold">Category:</span> {category}</div>
            <div><span className="font-semibold">Points:</span> {points ?? "—"}</div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">Retailers</h2>
        {prices?.length ? (
          <div className="rounded border divide-y">
            {prices.map((r, i) => (
              <div key={i} className="p-3 grid grid-cols-[1fr_auto_auto] items-center gap-3">
                <div className="font-medium">{r.seller_name}</div>
                <div className="font-bold tabular-nums">{fmtAUD(r.price)}</div>
                <div>
                  {r.link ? (
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Visit
                    </a>
                  ) : (
                    <span className="text-slate-400">No link</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-slate-500">No prices yet.</div>
        )}
      </div>
    </div>
  );
}
