// src/app/api/report-wrong-by-link/route.ts
//
// Public endpoint: record a "this price/link looks wrong" report. Reports
// NEVER take a listing down by themselves — they land in the admin review
// queue (prioritised by report count) where a human decides.
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let link = "";
  let reason = "";
  let sellerName: string | null = null;
  let productName: string | null = null;

  const ctype = req.headers.get("content-type") || "";
  try {
    if (ctype.includes("application/json")) {
      const body = await req.json();
      link = String(body?.link || "");
      reason = String(body?.reason || "");
      sellerName = body?.context?.sellerName ? String(body.context.sellerName) : null;
      productName = body?.context?.productName ? String(body.context.productName) : null;
    } else {
      const form = await req.formData();
      link = String(form.get("link") || "");
      reason = String(form.get("reason") || "");
    }
  } catch {}

  link = link.trim().slice(0, 500);
  reason = reason.trim().slice(0, 500);

  if (!link) {
    return NextResponse.json({ ok: false, error: "link required" }, { status: 400 });
  }

  await query("run", "create/reports");

  // resolve the pair this link belongs to, if we can
  const pair = (await query(
    "get",
    `SELECT pr.product_id, pr.seller_id FROM prices pr WHERE pr.link = ? LIMIT 1`,
    [link],
  )) as { product_id: number; seller_id: number } | undefined;

  await query(
    "run",
    `INSERT INTO reports (link, reason, seller_name, product_name, product_id, seller_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [link, reason || null, sellerName, productName, pair?.product_id ?? null, pair?.seller_id ?? null],
  );

  if (!ctype.includes("application/json")) {
    const html = `
      <div style="max-width:640px;margin:24px auto;font-family:system-ui,Segoe UI,Arial">
        <h3>Thanks — your report has been logged for review.</h3>
        <p style="word-break:break-all;"><code>${link.replace(/</g, "&lt;")}</code></p>
        <a href="/price-lookup"><button>Back to the site</button></a>
      </div>`;
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  return NextResponse.json({ ok: true, message: "Report logged for review." });
}
