export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { fetchAllProductMetadata } from "@/app/lib/product-metadata";

// Types to keep things clear
type DBPriceRow = {
  seller_name: string;
  shipping_info: string | null;
  price: number | null;
  link: string | null;
};
type APIShipping = { tag: string; deal: string };
type APIRetailer = {
  store: string;
  price: number | null;
  url: string | null;
  shipping?: APIShipping;
};

function parseShipping(raw: string | null): APIShipping | undefined {
  if (!raw) return undefined;
  try {
    const j = JSON.parse(raw);
    if (j && typeof j.tag === "string" && typeof j.deal === "string") {
      return { tag: j.tag, deal: j.deal };
    }
  } catch {}
  return undefined;
}
type APIProduct = {
  id: string;
  name: string;
  game?: string;
  faction?: string;
  category?: string;
  points?: number;
  image?: string | null;
  hidden?: boolean;
  retailers: APIRetailer[];
};

export async function GET() {
  // NOTE: This is simple (one query per product). If you have thousands of products,
  // consider a single SQL that pre-aggregates best prices or a paginated API.
  const metadataRows = await fetchAllProductMetadata();
  const products: APIProduct[] = [];

  for (const meta of metadataRows) {
    const idNum = Number(meta.productId);
    if (!Number.isFinite(idNum)) continue;
    if (meta.hidden) continue;

    const prices = (await query("all", "select/display_prices", [idNum])) as DBPriceRow[];

    products.push({
      id: String(meta.productId),
      name: meta.displayName,
      game: meta.game ?? undefined,
      faction: meta.faction ?? undefined,
      category: meta.category ?? undefined,
      points: meta.points ?? undefined,
      image: meta.image,
      hidden: meta.hidden,
      retailers: (prices ?? []).map((r) => ({
        store: r.seller_name,
        price: r.price,
        url: r.link,
        shipping: parseShipping(r.shipping_info),
      })),
    });
  }

  // No caching so the page reflects DB changes immediately
  return NextResponse.json({ products }, { headers: { "Cache-Control": "no-store" } });
}
