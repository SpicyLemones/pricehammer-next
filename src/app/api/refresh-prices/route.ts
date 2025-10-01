// src/app/api/refresh-prices/route.ts
import { NextResponse } from "next/server";
import pLimit from "p-limit";
import { query } from "@/lib/sql";
import { fetchPriceFromLinkWithSellerSelectors } from "@/lib/scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readSellerFromRequest(req: Request): Promise<number | null> {
  // Try JSON
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await req.json();
      if (body && body.seller !== undefined && body.seller !== "")
        return Number(body.seller);
    }
  } catch {}
  // Try form
  try {
    const form = await req.formData();
    const s = form.get("seller");
    if (typeof s === "string" && s.trim() !== "") return Number(s);
  } catch {}
  return null;
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const sellerFilter = await readSellerFromRequest(req);
  console.log(
    `[refresh-prices] START seller=${sellerFilter != null ? sellerFilter : "ALL"}`
  );

  const sellers =
    sellerFilter != null
      ? [await query("get", "select/seller_id", [sellerFilter])]
      : await query("all", "select/all_sellers");

  const pairs =
    sellerFilter != null
      ? await query("all", "select/validated_pairs_by_seller", [sellerFilter])
      : await query("all", "select/validated_pairs");

  const sById: Record<number, any> = {};
  (sellers as any[])?.forEach((s) => s && (sById[s.id] = s));

  const limit = pLimit(3); // <= at most 3 pages in-flight

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  await Promise.allSettled(
    (pairs as any[]).map(({ seller_id, product_id, link }) =>
      limit(async () => {
        if (!link) {
          skipped++;
          console.log(
            `[refresh-prices] SKIP p=${product_id} s=${seller_id} (no link)`
          );
          return;
        }

        const s =
          sById[seller_id] ||
          (await query("get", "select/seller_id", [seller_id]));
        if (!s) {
          skipped++;
          console.log(
            `[refresh-prices] SKIP p=${product_id} s=${seller_id} (seller missing)`
          );
          return;
        }

        console.log(
          `[refresh-prices] FETCH  p=${product_id} s=${seller_id} -> ${link}`
        );

        let price: number | null = null;
        try {
          price = await fetchPriceFromLinkWithSellerSelectors(s, link);
        } catch (e: any) {
          failed++;
          console.log(
            `[refresh-prices] ERROR p=${product_id} s=${seller_id}: ${
              e?.message || e
            }`
          );
          return;
        }

        if (price == null) {
          skipped++;
          console.log(
            `[refresh-prices] NONE  p=${product_id} s=${seller_id} (no price)`
          );
          return;
        }

        try {
          await query("run", "insert/price_history", [
            seller_id,
            product_id,
            price,
            link,
          ]);
        } catch {
          // ignore duplicates/history failure
        }

        await query("run", "update/price_only_validated", [
          price,
          link,
          seller_id,
          product_id,
        ]);
        updated++;
        console.log(
          `[refresh-prices] UPDATED p=${product_id} s=${seller_id} price=${price}`
        );
      })
    )
  );

  const ms = Date.now() - t0;
  console.log(
    `[refresh-prices] DONE updated=${updated} skipped=${skipped} failed=${failed} total=${
      (pairs as any[]).length
    } in ${ms}ms`
  );

  return NextResponse.json({
    ok: true,
    updated,
    skipped,
    failed,
    total: (pairs as any[]).length,
    ms,
  });
}
