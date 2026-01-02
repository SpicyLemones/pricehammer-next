import { NextResponse } from "next/server";
import { query } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// no-op (or implement your own audit-based undo)
export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/tinder", req.url));
}
