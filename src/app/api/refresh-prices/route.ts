import { NextResponse } from "next/server";
import pLimit from "p-limit";
import { query } from "@/lib/sql";
import { fetchPriceFromLinkWithSellerSelectors } from "@/lib/scrape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { seller } = await req.json().catch(() => ({} as any));

  const sellers = seller
    ? [await query("get", "select/seller_id", [seller])]
    : await query("all", "select/all_sellers");

  const pairs = seller
    ? await query("all", "select/validated_pairs_by_seller", [seller])
    : await query("all", "select/validated_pairs");

  const sById: Record<number, any> = {};
  sellers?.forEach((s: any) => s && (sById[s.id] = s));

  const limit = pLimit(3);
  let updated = 0;

  await Promise.all(
    pairs.map(({ seller_id, product_id, link }: any) =>
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
        updated++;
      })
    )
  );

  return NextResponse.json({ ok: true, updated, total: pairs?.length || 0 });
}
