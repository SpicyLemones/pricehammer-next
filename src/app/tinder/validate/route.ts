import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { setLastAction } from "../_state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originOf(req: Request) {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host;
  const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const s = Number(u.searchParams.get("s"));
  const p = Number(u.searchParams.get("p"));
  const link = u.searchParams.get("link") || "";
  const priceRaw = u.searchParams.get("price") || "";
  const price = priceRaw ? Number(priceRaw) : null;

  if (!s || !p) {
    return NextResponse.redirect(new URL("/tinder", originOf(req)));
  }

  // update: mark validated (your SQL expects link & price)
  await query("run", "update/validate_price", [link, price, s, p]);

  // record as the "last action"
  setLastAction(s, p);

  // go show the next one
  return NextResponse.redirect(new URL("/tinder", originOf(req)));
}
