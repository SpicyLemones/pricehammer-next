// src/app/api/undo/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
let lastAction: { s: string; p: string } | null = null;
// (optional) you can also track lastAction inside /api/validate & /api/invalidate.
// For brevity, do nothing here or keep a global if you want.
export const runtime = "nodejs";
export async function GET(req: Request) {
  // If you tracked lastAction, unvalidate it here.
  // await query("run", "update/unvalidate_price", [lastAction?.s, lastAction?.p]);
  return NextResponse.redirect(new URL("/tinder", req.url));
}
