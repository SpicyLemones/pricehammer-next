export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { loadManualProductsSnapshot } from "@/app/lib/manual-products";
import type { ManualProductRecord } from "@/app/lib/manual-products";

// Types to keep things clear
type DBPriceRow = { seller_name: string; price: number | null; link: string | null };
type APIRetailer = { store: string; price: number | null; url: string | null };
type APIProduct = {
  id: string;
  name: string;
  game?: string;
  faction?: string;
  category?: string;
  points?: number;
  image?: string | null;
  retailers: APIRetailer[];
};

export async function GET() {
  // NOTE: This is simple (one query per product). If you have thousands of products,
  // consider a single SQL that pre-aggregates best prices or a paginated API.
  const products: APIProduct[] = [];

  for (const p of ManualProducts) {
    if (p.hidden === true) continue;
    const idNum = Number(p.id);
    if (!Number.isFinite(idNum)) continue;

    // prices for this product (same query your product page uses)
    const prices = (await query("all", "select/display_prices", [idNum])) as DBPriceRow[];

    products.push({
      id: String(p.id),
      name: String(p.name ?? ""),
      game: p.game ?? undefined,
      faction: p.faction ?? undefined,
      category: p.category ?? undefined,
      points: typeof p.points === "number" ? p.points : undefined,
      image: p.image ?? null,
      retailers: (prices ?? []).map((r) => ({
        store: r.seller_name,
        price: r.price,
        url: r.link,
      })),
    });
  }

  // No caching so the page reflects DB changes immediately
  return NextResponse.json({ products }, { headers: { "Cache-Control": "no-store" } });
}
