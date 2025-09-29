import { NextResponse } from "next/server";
import { query } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const s = url.searchParams.get("s");
  const p = url.searchParams.get("p");
  if (s && p) {
    await query("run", "update/invalidate_price", [s, p]);
  }
  return NextResponse.redirect(new URL("/tinder", req.url));
}
