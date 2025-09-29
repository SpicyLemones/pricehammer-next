import { NextResponse } from "next/server";
import { query } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const s = url.searchParams.get("s");
  const p = url.searchParams.get("p");
  const link  = url.searchParams.get("link")  ?? "";
  const price = url.searchParams.get("price") ?? "";

  if (!s || !p) {
    return NextResponse.redirect(new URL("/tinder", req.url));
  }

  await query("run", "update/validate_price", [link, price, s, p]);
  return NextResponse.redirect(new URL("/tinder", req.url));
}
