// src/app/api/refresh-prices/route.ts
import { NextResponse } from "next/server";
import pLimit from "p-limit";
import { query } from "@/lib/sql";
import { fetchPriceFromLinkWithSellerSelectors } from "@/lib/scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PairRow = { seller_id: number; product_id: number; link: string | null };

// Read `seller` from ?seller=, form data, or JSON
async function readSellerId(req: Request): Promise<number | null> {
  let raw: string | null = null;

  // 1) query string
  const url = new URL(req.url);
  raw = url.searchParams.get("seller");

  // 2) form-encoded
  if (!raw) {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      try {
        const fd = await req.formData();
        const v = fd.get("seller");
        if (v != null) raw = String(v);
      } catch {}
    }
  }

  // 3) JSON
  if (!raw) {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        const body = (await req.json()) as { seller?: string | number } | undefined;
        if (body && body.seller != null) raw = String(body.seller);
      } catch {}
    }
  }

  const id = raw ? Number(raw) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function POST(req: Request) {
  const sellerId = await readSellerId(req);

  // Helpful debug in logs
  console.log("[refresh-prices] sellerId =", sellerId ?? "(all)");

  const sellers =
    sellerId != null
      ? [await query("get", "select/seller_id", [sellerId])]
      : await query("all", "select/all_sellers");

  if (sellerId != null && !sellers?.[0]) {
    return NextResponse.json({ ok: false, error: `Seller ${sellerId} not found` }, { status: 404 });
  }

  const pairs: PairRow[] =
    sellerId != null
      ? await query("all", "select/validated_pairs_by_seller", [sellerId])
      : await query("all", "select/validated_pairs");

  console.log("[refresh-prices] pairs =", pairs?.length ?? 0);

  const sById: Record<number, any> = {};
  (sellers || []).forEach((s: any) => s && (sById[s.id] = s));

  const limit = pLimit(3);
  let updated = 0;

  await Promise.all(
    (pairs || []).map(({ seller_id, product_id, link }) =>
      limit(async () => {
        if (!link) return;
        const s = sById[seller_id] || (await query("get", "select/seller_id", [seller_id]));
        if (!s) return;

        const price = await fetchPriceFromLinkWithSellerSelectors(s, link);
        if (price == null) return;

        try {
          await query("run", "insert/price_history", [seller_id, product_id, price, link]);
        } catch {}

        await query("run", "update/price_only_validated", [price, link, seller_id, product_id]);
        console.log(`[refresh-prices] updated seller=${seller_id} product=${product_id} price=${price}`);
        updated++;
      })
    )
  );

  return NextResponse.json({
    ok: true,
    sellerId: sellerId ?? "all",
    updated,
    total: (pairs || []).length,
  });
}
