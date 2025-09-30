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
  if (!s || !p) {
    return NextResponse.redirect(new URL("/tinder", originOf(req)));
  }

  await query("run", "update/invalidate_price", [s, p]);

  // record previous decision
  setLastAction(s, p);

  return NextResponse.redirect(new URL("/tinder", originOf(req)));
}
