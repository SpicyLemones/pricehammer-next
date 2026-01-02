import { NextResponse } from "next/server";
import { query } from "@/lib/sql";

export const runtime = "nodejs"; // use node runtime
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await query("all", "select/all_products");
  return NextResponse.json(data);
}
