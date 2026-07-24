// src/app/api/admin/purge-price-outliers/route.ts
// Demote validated prices that disagree wildly with the other sellers on the
// same product: under 45% or over 220% of the median, needing 3+ validated
// sellers. Wrong matches (paints, 1:18 collectibles, Legions Imperialis
// namesakes) show up as exactly this. Runs on this deployment's own data,
// pure SQL, no scraping.
//   GET  /api/admin/purge-price-outliers          report only
//   POST /api/admin/purge-price-outliers?apply=1  demote to validated=0
// Repeats until stable, since removing an outlier shifts the median.
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { logAudit } from "@/app/lib/audit";
import { all, run } from "@/app/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Outlier = { seller_id: number; product_id: number; seller: string; product: string; price: number; median: number };

async function findOutliers(): Promise<Outlier[]> {
  const rows = (await all(
    `SELECT p.seller_id, p.product_id, p.price, s.name AS seller, pr.name AS product
     FROM prices p
     JOIN sellers s ON s.id = p.seller_id
     JOIN products pr ON pr.id = p.product_id
     WHERE p.validated = 1 AND p.price > 0`,
  )) as { seller_id: number; product_id: number; price: number; seller: string; product: string }[];

  const byProduct = new Map<number, typeof rows>();
  for (const r of rows) {
    const arr = byProduct.get(r.product_id) ?? [];
    arr.push(r);
    byProduct.set(r.product_id, arr);
  }

  const outliers: Outlier[] = [];
  for (const [, ps] of byProduct) {
    if (ps.length < 3) continue;
    const sorted = ps.map((x) => x.price).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const p of ps) {
      if (p.price < median * 0.45 || p.price > median * 2.2) {
        outliers.push({ ...p, median });
      }
    }
  }
  return outliers;
}

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const outliers = await findOutliers();
  return NextResponse.json({ ok: true, count: outliers.length, outliers });
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const apply = new URL(req.url).searchParams.get("apply") === "1";
  if (!apply) {
    return NextResponse.json({ ok: false, error: "pass ?apply=1 to demote; GET reports without changing anything" }, { status: 400 });
  }

  const demoted: Outlier[] = [];
  // removing an outlier shifts the median, so sweep until nothing new falls out
  for (let round = 0; round < 5; round++) {
    const outliers = await findOutliers();
    if (!outliers.length) break;
    for (const o of outliers) {
      await run(
        `UPDATE prices SET validated = 0 WHERE seller_id = ? AND product_id = ? AND validated = 1`,
        [o.seller_id, o.product_id],
      );
      demoted.push(o);
    }
  }

  await logAudit("admin", "purge-price-outliers", { demoted: demoted.length });
  return NextResponse.json({
    ok: true,
    demoted: demoted.length,
    pairs: demoted.map((d) => ({ seller: d.seller, product: d.product, price: d.price, median: d.median })),
  });
}
