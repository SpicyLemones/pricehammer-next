// src/app/tinder/validate/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { setLastAction } from "../_state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Build the public origin from proxy headers (Render/Vercel/NGINX/etc.)
function originOf(req: Request) {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host;
  const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const s = Number(url.searchParams.get("s"));       // seller id
  const p = Number(url.searchParams.get("p"));       // product id
  const link = url.searchParams.get("link") || "";
  const price = url.searchParams.get("price") || "";
  const updateTerm = url.searchParams.get("updateTerm") === "1";
  const altTerm = (url.searchParams.get("altTerm") || "").trim();

  if (!s || !p) {
    return NextResponse.json({ ok: false, error: "Missing seller/product id" }, { status: 400 });
  }

  // Validate (same param order you used previously: link, price, seller, product)
  await query("run", "update/validate_price", [link, price, s, p]);

  // Optional: update search_term if the checkbox was ticked and a term was provided
  if (updateTerm && altTerm) {
    await query("run", "UPDATE products SET search_term = ? WHERE id = ?", [altTerm, p]);
    console.log("Name Updated to", altTerm);
  }

  // record previous decision
  setLastAction(s, p);

  // Redirect back to Tinder using the *public* origin (not req.url's internal one)
  const dest = new URL("/tinder", originOf(req));
  return NextResponse.redirect(dest, 303); // 303 = "See Other" (safe after GET/POST)
}
