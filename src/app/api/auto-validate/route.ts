// src/app/api/admin/auto-validate/route.ts
import { NextResponse } from "next/server";
import pLimit from "p-limit";
import { query, recomputeRemaining } from "@/lib/sql";
// import { searchSeller } from "@/lib/scraper"; // uncomment when ready

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { seller?: number | string; product?: number | string };
type PairRow = { seller_id: number; product_id: number };

export async function POST(req: Request) {
  try {
    const { seller, product } = (await req.json().catch(() => ({}))) as Body;

    const sellerFilter =
      seller !== undefined && seller !== null && seller !== "" ? Number(seller) : null;
    const productFilter =
      product !== undefined && product !== null && product !== "" ? Number(product) : null;

    let sql = `
      SELECT pr.seller_id, pr.product_id
      FROM prices pr
      WHERE pr.validated IS NULL
    `;
    const params: any[] = [];
    if (sellerFilter != null && !Number.isNaN(sellerFilter)) {
      sql += " AND pr.seller_id = ?";
      params.push(sellerFilter);
    }
    if (productFilter != null && !Number.isNaN(productFilter)) {
      sql += " AND pr.product_id = ?";
      params.push(productFilter);
    }

    // ✅ use query("all", rawSql, params) — your sql.ts detects raw SQL
    const unchecked = (await query("all", sql, params)) as PairRow[];

    if (!unchecked.length) {
      const remainingCount = await recomputeRemaining();
      return NextResponse.json({
        ok: true,
        processed: 0,
        validated: 0,
        skipped: 0,
        remainingCount,
      });
    }

    const [sellers, products] = await Promise.all([
      query("all", "select/all_sellers"),
      query("all", "select/all_products"),
    ]);
    const sById: Record<number, any> = Object.fromEntries((sellers as any[]).map((s) => [s.id, s]));
    const pById: Record<number, any> = Object.fromEntries((products as any[]).map((p) => [p.id, p]));

    const limit = pLimit(4);
    let validated = 0;
    let skipped = 0;

    await Promise.all(
      unchecked.map(({ seller_id, product_id }) =>
        limit(async () => {
          const s = sById[seller_id];
          const p = pById[product_id];
          if (!s || !p) {
            skipped++;
            return;
          }

          // When you port searchSeller, uncomment this block:
          // const candidates = await searchSeller(s, p);
          // const first = candidates?.[0];
          // if (!first?.link) { skipped++; return; }
          // await query("run", "update/auto_validate_price", [
          //   first.price ?? null,
          //   first.link,
          //   seller_id,
          //   product_id,
          // ]);
          // validated++;

          // For now (no searchSeller), just skip.
          skipped++;
        })
      )
    );

    const remainingCount = await recomputeRemaining();
    return NextResponse.json({
      ok: true,
      processed: unchecked.length,
      validated,
      skipped,
      remainingCount,
    });
  } catch (e: any) {
    console.error("auto-validate API error:", e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
