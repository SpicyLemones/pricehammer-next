// src/app/api/admin/prices-import/route.ts
// Sync locally-refreshed prices to this deployment, without touching anything
// else. The refresh itself runs on the local machine (scraping starves the
// small Render instance and browns out the live site), then pushes results
// here, same pattern as the recession collector.
//
// Usage (after `npm run refresh:prices` locally):
//   node scripts/push-prices.mjs https://www.spycy.fun
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { logAudit } from "@/app/lib/audit";
import { run } from "@/app/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  prices?: { seller_id: number; product_id: number; price: number; link: string | null }[];
  history?: { seller_id: number; product_id: number; price: number; link: string | null; recorded_at: string }[];
  // pairs judged wrong (price outliers, bad matches): demoted to validated=0
  // so they leave the product page until something re-validates them properly
  unvalidate?: { seller_id: number; product_id: number }[];
};

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  let prices = 0;
  for (const p of payload.prices ?? []) {
    const r = (await run(
      `UPDATE prices SET price = ?, link = ?
       WHERE seller_id = ? AND product_id = ? AND validated IS NOT NULL`,
      [p.price, p.link, p.seller_id, p.product_id],
    )) as { changes?: number };
    prices += r?.changes ?? 0;
  }

  // history rows are keyed on (seller, product, recorded_at) to stay
  // re-push safe: pushing the same window twice inserts nothing new
  let history = 0;
  for (const h of payload.history ?? []) {
    const r = (await run(
      `INSERT INTO price_history (seller_id, product_id, price, link, recorded_at)
       SELECT ?, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM price_history
         WHERE seller_id = ? AND product_id = ? AND recorded_at = ?
       )`,
      [h.seller_id, h.product_id, h.price, h.link, h.recorded_at, h.seller_id, h.product_id, h.recorded_at],
    )) as { changes?: number };
    history += r?.changes ?? 0;
  }

  let unvalidated = 0;
  for (const u of payload.unvalidate ?? []) {
    const r = (await run(
      `UPDATE prices SET validated = 0 WHERE seller_id = ? AND product_id = ? AND validated = 1`,
      [u.seller_id, u.product_id],
    )) as { changes?: number };
    unvalidated += r?.changes ?? 0;
  }

  await logAudit("admin", "prices-import", { prices, history, unvalidated });
  return NextResponse.json({ ok: true, prices, history, unvalidated });
}
