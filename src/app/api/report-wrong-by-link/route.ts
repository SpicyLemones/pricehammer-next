import { NextResponse } from "next/server";
import { query, recomputeRemaining } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { link, reason } = await req.json().catch(() => ({} as any));
  if (!link) return NextResponse.json({ ok: false, error: "link required" }, { status: 400 });

  try {
    // optional: audit table
    try {
      await query("run", "create/bug_reports");
      await query("run", "insert/bug_report_minimal", [link, reason || null]);
    } catch {}

    await query("run", "update/unvalidate_by_link", [link]);
    const remainingCount = await recomputeRemaining();

    return NextResponse.json({ ok: true, remainingCount });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}
