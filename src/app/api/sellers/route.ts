import { NextResponse } from "next/server";
import { query } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sellers = await query("all", "select/all_sellers");
  return NextResponse.json(sellers);
}
