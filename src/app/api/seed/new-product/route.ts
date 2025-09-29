import { NextResponse } from "next/server";
import { query, recomputeRemaining } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { product } = await req.json().catch(() => ({} as any));
  if (!product) return NextResponse.json({ ok: false, error: "product required" }, { status: 400 });

  await query("run", "insert/seed_prices_for_new_product", [product]);
  const remainingCount = await recomputeRemaining();
  return NextResponse.json({ ok: true, remainingCount });
}
