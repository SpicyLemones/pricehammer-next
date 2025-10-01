// src/app/tinder/validate/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { setLastAction } from "../_state";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";


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
    console.log("Name Updated to",altTerm)
  }
      // record previous decision
  setLastAction(s, p);    

  // Go back to the main Tinder page (relative – respects current host)
  return NextResponse.redirect(new URL("/tinder", req.url));
}
