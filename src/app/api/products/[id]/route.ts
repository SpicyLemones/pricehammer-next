// src/app/api/products/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

type ProductRow = { id: number; name: string; search_term: string };
type PriceRow = { seller_name: string; price: number | null; link: string | null };

export async function GET(_req: NextRequest, { params }: Params) {
  const product = await query<ProductRow>("get", "select/product_id", [params.id]);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prices = await query<PriceRow[]>("all", "select/display_prices", [product.id]);
  return NextResponse.json({ ...product, prices });
}
