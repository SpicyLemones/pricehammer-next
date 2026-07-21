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
import { getJob, startJob } from "@/app/lib/job-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RefreshRequest = { seller: number | null; async: boolean };

async function readRequest(req: Request): Promise<RefreshRequest> {
  const out: RefreshRequest = { seller: null, async: false };
  // Try JSON
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await req.json();
      if (body && body.seller !== undefined && body.seller !== "")
        out.seller = Number(body.seller);
      if (body && (body.async === true || body.async === "1" || body.async === "true"))
        out.async = true;
      return out;
    }
  } catch {}
  // Try form
  try {
    const form = await req.formData();
    const s = form.get("seller");
    if (typeof s === "string" && s.trim() !== "") out.seller = Number(s);
    const a = form.get("async");
    if (a === "1" || a === "true") out.async = true;
  } catch {}
  return out;
}

// Poll a running refresh: GET /api/refresh-prices?job=<id>
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("job");
  if (!id) return NextResponse.json({ ok: false, error: "missing ?job=<id>" }, { status: 400 });
  const job = getJob(id);
  if (!job) {
    // Not necessarily an error from the caller's side: a redeploy wipes the
    // in-memory registry, so "not found" also means "lost, run it again".
    return NextResponse.json({ ok: false, error: "job not found (finished long ago, or lost to a redeploy)" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, job });
}

export async function POST(req: Request) {
  const { seller: sellerFilter, async: wantAsync } = await readRequest(req);

  if (wantAsync) {
    const job = startJob(`refresh-prices${sellerFilter != null ? `-s${sellerFilter}` : ""}`, () =>
      runRefresh(sellerFilter),
    );
    console.log(`[refresh-prices] QUEUED job=${job.id} seller=${sellerFilter ?? "ALL"}`);
    return NextResponse.json({ ok: true, jobId: job.id, status: job.status });
  }

  const summary = await runRefresh(sellerFilter);
  return NextResponse.json({ ok: true, ...summary });
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

    let storefrontIndex: StorefrontIndexReady | undefined;
    const index = await buildStorefrontIndex(s);
    if (index) {
      if (index.status === "ready") {
        storefrontIndex = index;
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
    }

    const limit = pLimit(3); // <= at most 3 pages in-flight per seller

    await Promise.allSettled(
      pairs.map(({ product_id, link }) =>
        limit(async () => {
          const existingLink =
            typeof link === "string" && link.trim() !== "" ? link : null;
          console.log(
            `[refresh-prices] FETCH  p=${product_id} s=${sellerId} -> ${existingLink ?? "(no link)"}`
          );

          let priceSource: "api" | "scrape" | null = null;
          let price: number | null = null;
          let linkForUpdate: string | null = existingLink;

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
                  `[refresh-prices] STORE SKIP p=${product_id} s=${sellerId} (no price in feed, reason=${match.reason})`
                );
              }
            } else if (match && !trusted) {
              console.log(
                `[refresh-prices] STORE LOWCONF p=${product_id} s=${sellerId} (conf=${match.confidence.toFixed(2)}), falling back to stored link`
              );
            }
          }

          if (priceSource !== "api") {
            if (!existingLink) {
              skipped++;
              console.log(
                `[refresh-prices] SKIP p=${product_id} s=${sellerId} (no link and no feed price)`
              );
              return;
            }
            try {
              price = await fetchPriceFromLinkWithSellerSelectors(s, existingLink);
              priceSource = "scrape";
            } catch (e: any) {
              failed++;
              console.log(
                `[refresh-prices] ERROR p=${product_id} s=${sellerId}: ${
                  e?.message || e
                }`
              );
              return;
            }
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
