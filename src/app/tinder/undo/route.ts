import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { getLastAction } from "../_state";

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

  // Prefer explicit s/p from the link; otherwise fall back to lastAction
  const prev = (s && p) ? { s, p } : getLastAction();

  if (prev?.s && prev?.p) {
    await query("run", "update/unvalidate_price", [prev.s, prev.p]);
    // focus that exact pair again
    return NextResponse.redirect(new URL(`/tinder?s=${prev.s}&p=${prev.p}`, originOf(req)));
  }

  // nothing to undo—go back to queue
  return NextResponse.redirect(new URL("/tinder", originOf(req)));
}
