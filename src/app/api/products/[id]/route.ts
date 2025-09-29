import { NextResponse } from "next/server";
import { query } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const product = await query("get", "select/product_id", [params.id]);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prices = await query("all", "select/display_prices", [product.id]);
  return NextResponse.json({ ...product, prices });
}
