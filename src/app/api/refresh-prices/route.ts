// src/app/api/refresh-prices/route.ts
import { NextResponse } from "next/server";
import pLimit from "p-limit";
import { query } from "@/lib/sql";
import {
  buildStorefrontIndex,
  normalizeProductUrl,
  type StorefrontIndexReady,
} from "@/app/lib/storefronts";
import { ensureProductImage } from "@/app/lib/product-metadata";
import { probeSellerHealth, reconcileSellerStatus } from "@/app/lib/seller-health";
import { jobStatusResponse, runMaybeAsync } from "@/app/lib/job-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST {seller?, async?} — async:true (or ?async=1) runs in the background
// and returns a job id; poll GET /api/refresh-prices?job=<id>.
export async function GET(req: Request) {
  return jobStatusResponse(req);
}

export async function POST(req: Request) {
  return runMaybeAsync(req, "refresh-prices", async (r) => {
    const summary = await runRefresh(await readSeller(r));
    return NextResponse.json({ ok: true, ...summary });
  });
}

async function readSeller(req: Request): Promise<number | null> {
  const toSeller = (v: unknown) =>
    v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) return toSeller(((await req.json()) as { seller?: unknown })?.seller);
    if (ct.includes("form")) return toSeller((await req.formData()).get("seller"));
  } catch {}
  return toSeller(new URL(req.url).searchParams.get("seller"));
}

async function runRefresh(sellerFilter: number | null) {
  const t0 = Date.now();
  console.log(
    `[refresh-prices] START seller=${sellerFilter != null ? sellerFilter : "ALL"}`
  );

  const sellers =
    sellerFilter != null
      ? [await query("get", "select/seller_id", [sellerFilter])]
      : await query("all", "select/all_sellers");

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let total = 0;

  const productImageEnsures = new Map<number, Promise<void>>();

  // One seller at a time: health-check it, build its storefront index, refresh
  // its pairs, then let the index leave scope before the next seller starts.
  // Holding every seller's catalogue in memory at once is what pushed the
  // whole-run job past Render's memory limit.
  for (const s of sellers as any[]) {
    if (!s) continue;
    const sellerId = Number(s.id);
    if (!Number.isFinite(sellerId)) continue;
    const pairs = (await query("all", "select/validated_pairs_by_seller", [sellerId])) as any[];
    total += pairs.length;
    const label = `${s.name ?? "Seller"}#${sellerId}`;

    if ((s.status || "active") === "retired") {
      skipped += pairs.length;
      continue;
    }
    const health = await probeSellerHealth(String(s.base_url ?? ""));
    const status = await reconcileSellerStatus(sellerId, s.status, health);
    if (status === "dead") {
      skipped += pairs.length;
      console.log(`[refresh-prices] SKIP seller ${label} (dead: ${health.detail})`);
      continue;
    }

    const index = await buildStorefrontIndex(s);
    if (!index || index.status !== "ready") {
      // no feed = nothing to price from; don't walk every pair just to skip it
      skipped += pairs.length;
      console.log(`[refresh-prices] SKIP seller ${label} (no usable storefront feed)`);
      index?.diagnostics.forEach((msg) => console.log(`[refresh-prices] STORE WARN ${label}: ${msg}`));
      continue;
    }
    const storefrontIndex: StorefrontIndexReady = index;
    console.log(`[refresh-prices] STORE ${label}: ${index.matches.size} catalogue matches, ${index.diagnostics.length} unmatched feed items`);

    const limit = pLimit(3); // DB writes in flight per seller

    await Promise.allSettled(
      pairs.map(({ product_id, link }) =>
        limit(async () => {
          const existingLink =
            typeof link === "string" && link.trim() !== "" ? link : null;

          let priceSource: "api" | null = null;
          let price: number | null = null;
          let linkForUpdate: string | null = existingLink;

          {
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
                  `[refresh-prices] STORE SKIP p=${product_id} s=${sellerId} (no price in feed, reason=${match.reason})`
                );
              }
            } else if (match && !trusted) {
              console.log(
                `[refresh-prices] STORE LOWCONF p=${product_id} s=${sellerId} (conf=${match.confidence.toFixed(2)}), falling back to stored link`
              );
            }
          }

          // Prices come from store APIs only. A pair whose link isn't in the
          // store's feed (or whose store has no feed) keeps its last price —
          // headless-browser scraping was slow, got bot-walled, and starved
          // the server, so it's gone.
          if (priceSource !== "api") {
            skipped++;
            console.log(
              `[refresh-prices] SKIP p=${product_id} s=${sellerId} (${
                storefrontIndex ? "not in store feed" : "store has no usable feed"
              })`
            );
            return;
          }

          if (price == null) {
            skipped++;
            console.log(
              `[refresh-prices] NONE  p=${product_id} s=${sellerId} (no price)`
            );
            return;
          }

          try {
            await query("run", "insert/price_history", [
              sellerId,
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
            sellerId,
            product_id,
          ]);
          updated++;
          console.log(
            `[refresh-prices] UPDATED p=${product_id} s=${sellerId} price=${price} via=${priceSource ?? "unknown"}`
          );
        })
      )
    );

    // flush image work per seller so the map never grows unbounded either
    await Promise.allSettled(productImageEnsures.values());
    productImageEnsures.clear();
  }

  const ms = Date.now() - t0;
  console.log(
    `[refresh-prices] DONE updated=${updated} skipped=${skipped} failed=${failed} total=${total} in ${ms}ms`
  );

  return {
    updated,
    skipped,
    failed,
    total,
    ms,
  };
}
