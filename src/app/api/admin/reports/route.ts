// src/app/api/admin/reports/route.ts
//
// GET  — open reports grouped by link, ordered by report count (priority)
//        then recency. Each group carries product/seller context and the
//        individual reasons.
// POST — act on a group: {link, action}
//        "resolve"    close the reports (issue fixed / verified fine)
//        "dismiss"    close as noise
//        "unvalidate" send the matching price pair(s) back to the review
//                     queue AND close the reports (the old auto-behaviour,
//                     now an explicit admin decision)
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { isAdminRequest } from "@/lib/auth";
import { logAudit } from "@/app/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await query("run", "create/reports");
  const groups = (await query(
    "all",
    `SELECT r.link,
            COUNT(*) AS reportCount,
            MAX(r.created_at) AS latest,
            MIN(r.created_at) AS first,
            MAX(COALESCE(r.product_name, p.name)) AS productName,
            MAX(COALESCE(r.seller_name, s.name)) AS sellerName,
            MAX(r.product_id) AS productId,
            GROUP_CONCAT(COALESCE(NULLIF(r.reason, ''), '(no reason)'), ' | ') AS reasons
     FROM reports r
     LEFT JOIN products p ON p.id = r.product_id
     LEFT JOIN sellers s ON s.id = r.seller_id
     WHERE r.status = 'open'
     GROUP BY r.link
     ORDER BY reportCount DESC, latest DESC
     LIMIT 200`,
  )) as Record<string, unknown>[];
  return NextResponse.json({ ok: true, groups });
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { link?: string; action?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  const link = (body.link ?? "").trim();
  const action = body.action ?? "";
  if (!link || !["resolve", "dismiss", "unvalidate"].includes(action)) {
    return NextResponse.json(
      { ok: false, error: "need link and action resolve|dismiss|unvalidate" },
      { status: 400 },
    );
  }

  let pairsUnvalidated = 0;
  if (action === "unvalidate") {
    const r = (await query(
      "run",
      `UPDATE prices SET validated = NULL WHERE link = ?`,
      [link],
    )) as { changes?: number };
    pairsUnvalidated = r?.changes ?? 0;
  }

  const status = action === "dismiss" ? "dismissed" : "resolved";
  await query(
    "run",
    `UPDATE reports SET status = ?, resolved_at = datetime('now') WHERE link = ? AND status = 'open'`,
    [status, link],
  );

  await logAudit("admin", `report-${action}`, { link, pairsUnvalidated });
  return NextResponse.json({ ok: true, action, pairsUnvalidated });
}
