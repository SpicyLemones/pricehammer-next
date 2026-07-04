// src/app/api/refresh-prices/route.ts
import { NextResponse } from "next/server";
import pLimit from "p-limit";
import { query } from "@/lib/sql";
import { fetchPriceFromLinkWithSellerSelectors } from "@/lib/scraper";
import {
  buildStorefrontIndex,
  normalizeProductUrl,
  type StorefrontIndexReady,
} from "@/app/lib/storefronts";
import { ensureProductImage } from "@/app/lib/product-metadata";
import { probeSellerHealth, reconcileSellerStatus } from "@/app/lib/seller-health";

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

  // Health-check each seller first: dead/retired stores are skipped entirely
  // (their pairs keep old data but display already hides dead sellers).
  const skipSellers = new Set<number>();
  await Promise.allSettled(
    (sellers as any[]).map(async (s) => {
      if (!s) return;
      if ((s.status || "active") === "retired") {
        skipSellers.add(Number(s.id));
        return;
      }
      const health = await probeSellerHealth(String(s.base_url ?? ""));
      const status = await reconcileSellerStatus(Number(s.id), s.status, health);
      if (status === "dead") {
        skipSellers.add(Number(s.id));
        console.log(`[refresh-prices] SKIP seller ${s.name ?? s.id} (dead: ${health.detail})`);
      }
    }),
  );

  const storefrontIndexes = new Map<number, StorefrontIndexReady>();
  const storefrontLimit = pLimit(2);
  await Promise.allSettled(
    (sellers as any[]).map((sellerRow) =>
      storefrontLimit(async () => {
        if (!sellerRow) return;
        const sellerId = Number(sellerRow.id);
        if (!Number.isFinite(sellerId) || skipSellers.has(sellerId)) return;
        const index = await buildStorefrontIndex(sellerRow);
        if (!index) return;
        const label = `${sellerRow.name ?? "Seller"}#${sellerId}`;
        if (index.status === "ready") {
          storefrontIndexes.set(sellerId, index);
          index.diagnostics.forEach((msg) =>
            console.log(`[refresh-prices] STORE INFO ${label}: ${msg}`),
          );
        } else {
          index.diagnostics.forEach((msg) =>
            console.log(`[refresh-prices] STORE WARN ${label}: ${msg}`),
          );
          if (index.fallbackOption) {
            console.log(
              `[refresh-prices] STORE Fallback ${label}: ${index.fallbackOption.message}`,
            );
          }
        }
      }),
    ),
  );

  const limit = pLimit(3); // <= at most 3 pages in-flight

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const productImageEnsures = new Map<number, Promise<void>>();

  await Promise.allSettled(
    (pairs as any[]).map(({ seller_id, product_id, link }) =>
      limit(async () => {
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
        if (skipSellers.has(Number(seller_id))) {
          skipped++;
          return;
        }

        const existingLink =
          typeof link === "string" && link.trim() !== "" ? link : null;
        console.log(
          `[refresh-prices] FETCH  p=${product_id} s=${seller_id} -> ${existingLink ?? "(no link)"}`
        );

        let priceSource: "api" | "scrape" | null = null;
        let price: number | null = null;
        let linkForUpdate: string | null = existingLink;

        const storefrontIndex = storefrontIndexes.get(Number(seller_id));
        if (storefrontIndex) {
          // The stored link IS the product's identity (it was validated or
          // SKU-verified) — look it up in the feed directly first. Only fall
          // back to catalogue matching when the link isn't in the feed.
          const linkKey = normalizeProductUrl(existingLink);
          const byLinkMatch = linkKey
            ? storefrontIndex.byLink?.get(linkKey)
            : undefined;
          const catalogueMatch = storefrontIndex.matches.get(Number(product_id));
          // Trust gate for catalogue matches only (byLink is inherently
          // trusted): SKU-verified or high-confidence name, same as
          // auto-validate. Weaker fuzzy matches must NOT update validated
          // pairs — a 0.55 name match can overwrite a human-validated link
          // with a related-but-wrong product.
          const trusted =
            byLinkMatch != null ||
            (catalogueMatch &&
              (catalogueMatch.reason === "sku" || catalogueMatch.confidence >= 0.85));
          const match = byLinkMatch ?? catalogueMatch;
          if (match && trusted) {
            if (match.price != null) {
              price = match.price;
              priceSource = "api";
              if (match.url) {
                linkForUpdate = match.url;
              }
              if (match.image) {
                const pid = Number(product_id);
                if (!productImageEnsures.has(pid)) {
                  productImageEnsures.set(
                    pid,
                    ensureProductImage(pid, match.image).catch(() => undefined),
                  );
                }
              }
            } else {
              console.log(
                `[refresh-prices] STORE SKIP p=${product_id} s=${seller_id} (no price in feed, reason=${match.reason})`
              );
            }
          } else if (match && !trusted) {
            console.log(
              `[refresh-prices] STORE LOWCONF p=${product_id} s=${seller_id} (conf=${match.confidence.toFixed(2)}) — falling back to stored link`
            );
          }
        }

        if (priceSource !== "api") {
          if (!existingLink) {
            skipped++;
            console.log(
              `[refresh-prices] SKIP p=${product_id} s=${seller_id} (no link and no feed price)`
            );
            return;
          }
          try {
            price = await fetchPriceFromLinkWithSellerSelectors(s, existingLink);
            priceSource = "scrape";
          } catch (e: any) {
            failed++;
            console.log(
              `[refresh-prices] ERROR p=${product_id} s=${seller_id}: ${
                e?.message || e
              }`
            );
            return;
          }
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
            linkForUpdate,
          ]);
        } catch {
          // ignore duplicates/history failure
        }

        await query("run", "update/price_only_validated", [
          price,
          linkForUpdate,
          seller_id,
          product_id,
        ]);
        updated++;
        console.log(
          `[refresh-prices] UPDATED p=${product_id} s=${seller_id} price=${price} via=${priceSource ?? "unknown"}`
        );
      })
    )
  );

  await Promise.allSettled(productImageEnsures.values());

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
