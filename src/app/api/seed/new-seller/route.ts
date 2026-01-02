import { NextResponse } from "next/server";
import { query, recomputeRemaining } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { seller } = await req.json().catch(() => ({} as any));
  if (!seller) return NextResponse.json({ ok: false, error: "seller required" }, { status: 400 });

  await query("run", "insert/seed_prices_for_new_seller", [seller]);
  const remainingCount = await recomputeRemaining();
  return NextResponse.json({ ok: true, remainingCount });
}
