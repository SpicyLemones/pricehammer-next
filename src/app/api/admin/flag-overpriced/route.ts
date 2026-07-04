// src/app/api/admin/flag-overpriced/route.ts
//
// Warhammer Official's price is the RRP ceiling: a validated third-party
// price meaningfully above it is almost always a wrong link or stale data.
// This sweep unvalidates those pairs (back to the review queue).
//
//   curl -u U:P -X POST "/api/admin/flag-overpriced"          # dry run (list)
//   curl -u U:P -X POST "/api/admin/flag-overpriced?apply=1"  # unvalidate
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { isAuthorizedAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RRP_CEILING = 1.03; // above this x RRP: suspect (GW is never undercut upward)
const RRP_FLOOR = 0.5; // below this x RRP: suspect (deeper than any normal discount)

type Row = {
  seller_id: number;
  product_id: number;
  seller: string;
  product: string;
  price: number;
  rrp: number;
};

export async function POST(req: Request) {
  if (!isAuthorizedAdmin(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const apply = ["1", "true"].includes((url.searchParams.get("apply") ?? "").toLowerCase());

  const rows = (await query(
    "all",
    `SELECT pr.seller_id, pr.product_id, s.name AS seller, p.name AS product,
            pr.price, gw.price AS rrp
     FROM prices pr
     JOIN sellers s ON s.id = pr.seller_id
     JOIN products p ON p.id = pr.product_id
     JOIN prices gw ON gw.product_id = pr.product_id AND gw.validated = 1
     JOIN sellers gws ON gws.id = gw.seller_id AND gws.name LIKE '%Warhammer%'
     WHERE pr.validated = 1
       AND s.name NOT LIKE '%Warhammer%'
       AND pr.price IS NOT NULL AND gw.price IS NOT NULL AND gw.price > 0
       AND (pr.price > gw.price * ${RRP_CEILING} OR pr.price < gw.price * ${RRP_FLOOR})
     ORDER BY (pr.price / gw.price) DESC`,
  )) as Row[];

  // Consensus rule (both directions): if two or more third-party stores agree
  // on a price far above OR far below "RRP", our GW price is the outlier
  // (a wrong GW match) — flag the GW pair for review instead of punishing
  // the retailers.
  const byProduct = new Map<number, Row[]>();
  for (const r of rows) {
    const list = byProduct.get(r.product_id) ?? [];
    list.push(r);
    byProduct.set(r.product_id, list);
  }
  const retailerFlags: Row[] = [];
  const gwSuspect: { product_id: number; product: string; rrp: number; others: number }[] = [];
  for (const [productId, list] of byProduct) {
    const wellAbove = list.filter((r) => r.price > r.rrp * 1.5);
    const wellBelow = list.filter((r) => r.price < r.rrp * 0.4);
    if (wellAbove.length >= 2 || wellBelow.length >= 2) {
      gwSuspect.push({
        product_id: productId,
        product: list[0].product,
        rrp: list[0].rrp,
        others: list.length,
      });
    } else {
      retailerFlags.push(...list);
    }
  }

  let flagged = 0;
  let gwFlagged = 0;
  if (apply) {
    for (const r of retailerFlags) {
      await query(
        "run",
        `UPDATE prices SET validated = NULL WHERE seller_id = ? AND product_id = ?`,
        [r.seller_id, r.product_id],
      );
      flagged++;
    }
    for (const g of gwSuspect) {
      await query(
        "run",
        `UPDATE prices SET validated = NULL
         WHERE product_id = ? AND seller_id IN (SELECT id FROM sellers WHERE name LIKE '%Warhammer%')`,
        [g.product_id],
      );
      gwFlagged++;
    }
  }

  return NextResponse.json({
    ok: true,
    apply,
    found: rows.length,
    retailerSuspects: retailerFlags.length,
    gwSuspects: gwSuspect.length,
    flagged,
    gwFlagged,
    retailerSample: retailerFlags.slice(0, 25).map(
      (r) => `${r.seller}: "${r.product}" $${r.price} vs RRP $${r.rrp}`,
    ),
    gwSample: gwSuspect.slice(0, 25).map(
      (g) => `"${g.product}" GW price $${g.rrp} contradicted by ${g.others} retailers`,
    ),
  });
}
