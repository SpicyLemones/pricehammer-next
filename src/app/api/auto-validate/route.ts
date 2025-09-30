// src/app/api/admin/auto-validate/route.ts
import { NextResponse } from "next/server";
import pLimit from "p-limit";
import { query, recomputeRemaining } from "@/lib/sql";
import { searchSeller } from "@/lib/scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PairRow = { seller_id: number; product_id: number };
type SellerRow = {
  id: number;
  name?: string;
  base_url: string;
  search_url: string;
  product_selector: string;
  name_selector?: string;
  link_selector?: string;
  price_selector?: string;
  sale_selector?: string;
  image_selector?: string;
};
type ProductRow = { id: number; name: string; search_term: string };

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  try {
    // 1) read from query string
    const url = new URL(req.url);
    const qsSeller = toInt(url.searchParams.get("seller"));
    const qsProduct = toInt(url.searchParams.get("product"));
    const qsLimit = toInt(url.searchParams.get("limit"));

    // 2) read body based on content-type (JSON or form)
    const ct = req.headers.get("content-type") || "";
    let bodySeller: number | null = null;
    let bodyProduct: number | null = null;
    let bodyLimit: number | null = null;

    if (ct.includes("application/json")) {
      const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      bodySeller = toInt(j?.seller);
      bodyProduct = toInt(j?.product);
      bodyLimit = toInt(j?.limit);
    } else if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const form = await req.formData().catch(() => null);
      if (form) {
        bodySeller = toInt(form.get("seller"));
        bodyProduct = toInt(form.get("product"));
        bodyLimit = toInt(form.get("limit"));
      }
    }

    // 3) final filters (body wins over query)
    const sellerFilter = bodySeller ?? qsSeller;
    const productFilter = bodyProduct ?? qsProduct;
    const limitCount = bodyLimit ?? qsLimit ?? null;

    console.log("[auto-validate] filters =>", {
      sellerFilter,
      productFilter,
      limitCount,
      source: ct.includes("json") ? "json" : ct ? "form" : "query",
    });

    // 4) build filtered SQL
    let sql = `
      SELECT pr.seller_id, pr.product_id
      FROM prices pr
      WHERE pr.validated IS NULL
    `;
    const params: unknown[] = [];
    if (sellerFilter !== null) {
      sql += " AND pr.seller_id = ?";
      params.push(sellerFilter);
    }
    if (productFilter !== null) {
      sql += " AND pr.product_id = ?";
      params.push(productFilter);
    }
    if (Number.isFinite(limitCount) && (limitCount as number) > 0) {
      sql += " LIMIT ?";
      params.push(limitCount as number);
    }

    const unchecked = (await query("all", sql, params)) as PairRow[];
    console.log("[auto-validate] candidates:", unchecked.length);

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

    // 5) cache sellers/products
    const [sellers, products] = await Promise.all([
      query("all", "select/all_sellers"),
      query("all", "select/all_products"),
    ]);
    const sById: Record<number, SellerRow> = Object.fromEntries(
      (sellers as SellerRow[]).map((s) => [s.id, s])
    );
    const pById: Record<number, ProductRow> = Object.fromEntries(
      (products as ProductRow[]).map((p) => [p.id, p])
    );

    // 6) process with small concurrency
    const limit = pLimit(2);
    let validated = 0;
    let skipped = 0;

    await Promise.all(
      unchecked.map(({ seller_id, product_id }) =>
        limit(async () => {
          const s = sById[seller_id];
          const p = pById[product_id];
          if (!s || !p) {
            skipped++;
            console.log("[auto-validate] skip: missing s/p", { seller_id, product_id });
            return;
          }

          try {
            const cands = await searchSeller(s as any, p as any);
            const first = cands?.[0];
            if (!first?.link) {
              skipped++;
              console.log("[auto-validate] no candidates", { seller_id, product_id });
              return;
            }

            await query("run", "update/auto_validate_price", [
              first.price ?? null,
              first.link,
              seller_id,
              product_id,
            ]);

            validated++;
            console.log("[auto-validate] VALIDATED", {
              seller_id,
              product_id,
              link: first.link,
              price: first.price ?? null,
            });
          } catch (e: unknown) {
            skipped++;
            console.log("[auto-validate] error", {
              seller_id,
              product_id,
              err: e instanceof Error ? e.message : String(e),
            });
          }
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("auto-validate API error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
