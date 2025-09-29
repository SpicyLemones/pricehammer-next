import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { query, recomputeRemaining } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const raw = fs.readFileSync(path.join(process.cwd(), "data/db/json/sellers.json"), "utf8");
  const sellers = JSON.parse(raw);
  const existing = await query("all", "select/all_sellers");
  const set = new Set(existing.map((s: any) => `${s.name}|||${s.base_url}`));

  let inserted = 0;
  for (const s of sellers) {
    const key = `${s.name}|||${s.base_url}`;
    if (set.has(key)) continue;

    await query("run", "insert/seller", [
      s.name, s.base_url, s.search_url, s.product_selector,
      s.name_selector, s.link_selector, s.price_selector, s.sale_selector, s.image_selector,
    ]);

    const row = await query("get", "select/seller_by_name_base", [s.name, s.base_url]);
    if (row?.id) {
      await query("run", "insert/seed_prices_for_new_seller", [row.id]);
      inserted++;
    }
  }

  const remainingCount = await recomputeRemaining();
  return NextResponse.json({ ok: true, inserted, remainingCount });
}
