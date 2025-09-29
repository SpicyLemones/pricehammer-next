// src/app/api/invalidate/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const s = searchParams.get("s");
  const p = searchParams.get("p");
  if (!s || !p) return NextResponse.json({ ok:false, error:"s & p required" }, { status:400 });
  await query("run", "update/invalidate_price", [s, p]);
  return NextResponse.redirect(new URL("/tinder", req.url));
}
