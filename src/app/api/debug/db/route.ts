// src/app/api/debug/db/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const list = await query("all", "PRAGMA database_list");
    const mode = await query("get", "PRAGMA journal_mode");
    const pageCount = await query("get", "PRAGMA page_count");
    const freelist = await query("get", "PRAGMA freelist_count");
    return NextResponse.json({
      database_list: list,
      journal_mode: mode,
      page_count: pageCount?.page_count,
      freelist_count: freelist?.freelist_count,
    }, { headers: { "cache-control": "no-store" }});
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:e?.message }, { status:500 });
  }
}
