// src/app/api/admin/verify-links/route.ts
//
// Verify stored links for scraped (feed-less) sellers like War For Less and
// Frontline Hobbies: open each validated pair's link with Puppeteer and check
// the page identifies the right product.
//   1. SKU on page (JSON-LD / data-product-sku) -> compare to canonical SKU
//   2. no SKU (e.g. War For Less) -> compare page title to product name with
//      the shared matcher (>=0.85 verified, <=0.5 mismatch)
//   match    -> sku_verified=1, price refreshed from the page
//   mismatch -> unvalidated (back to the review queue), sku_verified=0
//   unclear  -> left alone (marked -1 so we don't retry it every run)
//
// Resumable: only processes pairs where sku_verified IS NULL.
//   curl -u U:P -X POST "/api/admin/verify-links?seller=1&limit=50"
import { NextResponse } from "next/server";
import pLimit from "p-limit";
import { query } from "@/lib/sql";
import { isAdminRequest } from "@/lib/auth";
import { fetchSkuAndPriceFromPage } from "@/lib/scraper";
import { normalizeShopifySku } from "@/app/lib/shopify";
import { scoreTitleAgainstName } from "@/app/lib/shopify-catalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PairRow = {
  seller_id: number;
  product_id: number;
  link: string;
  price: number | null;
  canonical_sku: string | null;
  sku_aliases: string | null;
  product_name: string | null;
};

function skuSetFor(row: PairRow): Set<string> {
  const set = new Set<string>();
  const add = (raw: string | null) => {
    const n = normalizeShopifySku(raw);
    if (n) set.add(n);
  };
  add(row.canonical_sku);
  try {
    for (const a of JSON.parse(row.sku_aliases ?? "[]")) {
      if (typeof a === "string") add(a);
    }
  } catch {}
  return set;
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const seller = Number(url.searchParams.get("seller"));
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const dryRun = ["1", "true"].includes((url.searchParams.get("dryRun") ?? "").toLowerCase());
  if (!Number.isFinite(seller)) {
    return NextResponse.json({ ok: false, error: "seller param required" }, { status: 400 });
  }

  const pairs = (await query(
    "all",
    `SELECT pr.seller_id, pr.product_id, pr.link, pr.price,
            ps.canonical_sku, ps.sku_aliases, p.name AS product_name
     FROM prices pr
     JOIN product_skus ps ON ps.product_id = pr.product_id
     JOIN products p ON p.id = pr.product_id
     WHERE pr.seller_id = ? AND pr.validated = 1
       AND pr.link IS NOT NULL AND pr.link != ''
       AND pr.sku_verified IS NULL
     ORDER BY pr.product_id
     LIMIT ?`,
    [seller, limit],
  )) as PairRow[];

  let verified = 0;
  let mismatched = 0;
  let noSku = 0;
  let failed = 0;
  const mismatches: Record<string, unknown>[] = [];

  const limiter = pLimit(2);
  await Promise.all(
    pairs.map((row) =>
      limiter(async () => {
        try {
          const { sku, price, title } = await fetchSkuAndPriceFromPage(row.link);
          const pageSku = normalizeShopifySku(sku);
          const wanted = skuSetFor(row);

          // decide: verified / mismatch / unclear
          let outcome: "verified" | "mismatch" | "unclear";
          let evidence: string;
          if (pageSku && wanted.has(pageSku)) {
            outcome = "verified";
            evidence = `sku ${pageSku}`;
          } else if (pageSku && wanted.size > 0) {
            outcome = "mismatch";
            evidence = `page sku ${pageSku} != ${[...wanted].join("/")}`;
          } else if (title && row.product_name) {
            const score = scoreTitleAgainstName(title, row.product_name);
            if (score >= 0.85) {
              outcome = "verified";
              evidence = `title match ${(score * 100).toFixed(0)}% ("${title.slice(0, 50)}")`;
            } else if (score <= 0.5) {
              outcome = "mismatch";
              evidence = `title "${title.slice(0, 50)}" scores ${(score * 100).toFixed(0)}% vs "${row.product_name}"`;
            } else {
              outcome = "unclear";
              evidence = `title score ${(score * 100).toFixed(0)}%`;
            }
          } else {
            outcome = "unclear";
            evidence = "no sku and no readable title";
          }

          if (outcome === "verified") {
            verified++;
            if (!dryRun) {
              await query(
                "run",
                `UPDATE prices SET sku_verified = 1${price != null ? ", price = ?" : ""}
                 WHERE seller_id = ? AND product_id = ?`,
                price != null
                  ? [price, row.seller_id, row.product_id]
                  : [row.seller_id, row.product_id],
              );
            }
          } else if (outcome === "mismatch") {
            mismatched++;
            mismatches.push({
              product_id: row.product_id,
              link: row.link,
              evidence,
            });
            if (!dryRun) {
              await query(
                "run",
                `UPDATE prices SET validated = NULL, sku_verified = 0
                 WHERE seller_id = ? AND product_id = ?`,
                [row.seller_id, row.product_id],
              );
            }
          } else {
            noSku++;
            if (!dryRun) {
              await query(
                "run",
                `UPDATE prices SET sku_verified = -1 WHERE seller_id = ? AND product_id = ?`,
                [row.seller_id, row.product_id],
              );
            }
          }
        } catch (e) {
          failed++;
          console.log(
            `[verify-links] ERROR p=${row.product_id}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }),
    ),
  );

  const remaining = (await query(
    "get",
    `SELECT COUNT(*) AS c FROM prices pr
     JOIN product_skus ps ON ps.product_id = pr.product_id
     WHERE pr.seller_id = ? AND pr.validated = 1
       AND pr.link IS NOT NULL AND pr.link != '' AND pr.sku_verified IS NULL`,
    [seller],
  )) as { c: number };

  return NextResponse.json({
    ok: true,
    dryRun,
    processed: pairs.length,
    verified,
    mismatched,
    noSku,
    failed,
    remainingToVerify: remaining.c,
    mismatchSample: mismatches.slice(0, 20),
  });
}
