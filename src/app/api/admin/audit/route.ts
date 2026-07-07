// src/app/api/admin/audit/route.ts — recent admin actions, newest first.
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { isAdminRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await query("run", "create/admin_audit");
  const events = await query(
    "all",
    `SELECT at, actor, action, detail FROM admin_audit ORDER BY id DESC LIMIT 50`,
  );
  return NextResponse.json({ ok: true, events });
}
