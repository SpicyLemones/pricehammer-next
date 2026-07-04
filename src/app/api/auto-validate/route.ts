// src/app/api/auto-validate/route.ts
//
// Auto-validate unchecked seller/product price pairs using storefront feeds
// and the canonical GW SKU catalogue — NOT "first search hit wins".
//
// Acceptance rules (per matched feed product):
//   - SKU-verified match           -> accept
//   - fuzzy-name confidence >=0.85 -> accept
//   - anything else                -> left unchecked for /tinder review
// Sellers without a usable storefront feed (misc/Cloudflare-walled) are
// skipped entirely: we no longer blind-validate scraper guesses.
//
// Params (query string, JSON body, or form data; body wins):
//   seller  - only process this seller id
//   product - only process this product id
//   dryRun  - "1"/"true": report what WOULD be accepted, write nothing
//   invalidateUnmatched - "1"/"true": pairs with NO feed match at all (for a
//       SKU-tracked product at a feed-ready seller) are marked validated=0 —
//       the store's full inventory is in the feed, so no match means they
//       don't stock it. Pairs with a low-confidence candidate stay for review.
import { NextResponse } from "next/server";
import { query, recomputeRemaining } from "@/lib/sql";
import {
  buildStorefrontIndex,
  type StorefrontIndexReady,
  type StorefrontPriceMatch,
} from "@/app/lib/storefronts";
import { probeSellerHealth, reconcileSellerStatus } from "@/app/lib/seller-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_ACCEPT_CONFIDENCE = 0.85;

type PairRow = { seller_id: number; product_id: number };
type SellerRow = {
  id: number;
  name?: string;
  base_url?: string;
  storefront?: unknown;
};

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: unknown): boolean {
  return v === true || v === "1" || v === "true" || v === "on";
}

function shouldAccept(match: StorefrontPriceMatch): boolean {
  if (match.price == null || !match.url) return false;
  if (match.reason === "sku") return true;
  return match.confidence >= NAME_ACCEPT_CONFIDENCE;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    let seller = toInt(url.searchParams.get("seller"));
    let product = toInt(url.searchParams.get("product"));
    let dryRun = toBool(url.searchParams.get("dryRun"));
    let invalidateUnmatched = toBool(url.searchParams.get("invalidateUnmatched"));

    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      seller = toInt(j?.seller) ?? seller;
      product = toInt(j?.product) ?? product;
      if (j?.dryRun !== undefined) dryRun = toBool(j.dryRun);
      if (j?.invalidateUnmatched !== undefined) invalidateUnmatched = toBool(j.invalidateUnmatched);
    } else if (
      ct.includes("application/x-www-form-urlencoded") ||
      ct.includes("multipart/form-data")
    ) {
      const form = await req.formData().catch(() => null);
      if (form) {
        seller = toInt(form.get("seller")) ?? seller;
        product = toInt(form.get("product")) ?? product;
        if (form.get("dryRun") != null) dryRun = toBool(form.get("dryRun"));
      }
    }

    console.log("[auto-validate] filters =>", { seller, product, dryRun });

    // 1) load unchecked pairs
    let sql = `SELECT pr.seller_id, pr.product_id FROM prices pr WHERE pr.validated IS NULL`;
    const params: unknown[] = [];
    if (seller !== null) {
      sql += " AND pr.seller_id = ?";
      params.push(seller);
    }
    if (product !== null) {
      sql += " AND pr.product_id = ?";
      params.push(product);
    }
    const unchecked = (await query("all", sql, params)) as PairRow[];

    if (!unchecked.length) {
      return NextResponse.json({
        ok: true,
        dryRun,
        processed: 0,
        accepted: 0,
        remainingCount: await recomputeRemaining(),
      });
    }

    // 2) group pairs by seller and build one storefront index per seller
    const bySeller = new Map<number, PairRow[]>();
    for (const pair of unchecked) {
      const list = bySeller.get(pair.seller_id) ?? [];
      list.push(pair);
      bySeller.set(pair.seller_id, list);
    }

    const sellers = (await query("all", "select/all_sellers")) as SellerRow[];
    const sellerById = new Map(sellers.map((s) => [Number(s.id), s]));

    // SKU-tracked products: for these, "absent from the feed" is meaningful
    const skuTracked = new Set<number>(
      ((await query("all", `SELECT product_id FROM product_skus`)) as { product_id: number }[]).map(
        (r) => Number(r.product_id),
      ),
    );

    let accepted = 0;
    let acceptedBySku = 0;
    let acceptedByName = 0;
    let invalidatedNotStocked = 0;
    let leftForReview = 0;
    let skippedNoStorefront = 0;
    const perSeller: Record<string, unknown>[] = [];
    const acceptedRows: Record<string, unknown>[] = [];

    for (const [sellerId, pairs] of bySeller) {
      const sellerRow = sellerById.get(sellerId);
      const label = `${sellerRow?.name ?? "Seller"}#${sellerId}`;
      if (!sellerRow) {
        skippedNoStorefront += pairs.length;
        perSeller.push({ seller: label, skipped: pairs.length, why: "unknown seller" });
        continue;
      }

      // lifecycle check: retired sellers never process; dead sellers are
      // re-probed so they resurrect automatically when back online
      const currentStatus = (sellerRow as { status?: string }).status || "active";
      if (currentStatus === "retired") {
        skippedNoStorefront += pairs.length;
        perSeller.push({ seller: label, skipped: pairs.length, why: "retired" });
        continue;
      }
      const health = await probeSellerHealth(String(sellerRow.base_url ?? ""));
      const status = await reconcileSellerStatus(sellerId, currentStatus, health);
      if (status === "dead") {
        skippedNoStorefront += pairs.length;
        perSeller.push({ seller: label, skipped: pairs.length, why: `dead (${health.detail})` });
        continue;
      }

      const index = await buildStorefrontIndex(sellerRow as never);
      if (!index || index.status !== "ready") {
        skippedNoStorefront += pairs.length;
        const why =
          index?.diagnostics?.[0] ??
          "no storefront feed (misc platform) — pairs stay unchecked for manual review";
        console.log(`[auto-validate] SKIP ${label}: ${why}`);
        perSeller.push({ seller: label, skipped: pairs.length, why });
        continue;
      }

      const ready = index as StorefrontIndexReady;
      let sellerAccepted = 0;
      let sellerReview = 0;

      for (const { seller_id, product_id } of pairs) {
        const match = ready.matches.get(Number(product_id));

        // No feed match at all for a SKU-tracked product = the store's feed
        // (their full inventory) doesn't carry it -> not stocked.
        if (!match && invalidateUnmatched && skuTracked.has(Number(product_id))) {
          if (!dryRun) {
            await query(
              "run",
              `UPDATE prices SET validated = 0 WHERE seller_id = ? AND product_id = ?`,
              [seller_id, product_id],
            );
          }
          invalidatedNotStocked++;
          continue;
        }

        if (!match || !shouldAccept(match)) {
          sellerReview++;
          continue;
        }

        if (!dryRun) {
          await query("run", "update/auto_validate_price", [
            match.price,
            match.url,
            seller_id,
            product_id,
          ]);
        }
        sellerAccepted++;
        accepted++;
        if (match.reason === "sku") acceptedBySku++;
        else acceptedByName++;
        acceptedRows.push({
          seller_id,
          product_id,
          price: match.price,
          url: match.url,
          reason: match.reason,
          confidence: Number(match.confidence.toFixed(3)),
          title: match.title,
        });
      }

      leftForReview += sellerReview;
      perSeller.push({
        seller: label,
        pairs: pairs.length,
        accepted: sellerAccepted,
        leftForReview: sellerReview,
      });
      console.log(
        `[auto-validate] ${label}: accepted=${sellerAccepted} review=${sellerReview}${dryRun ? " (dry run)" : ""}`,
      );
    }

    const remainingCount = dryRun ? null : await recomputeRemaining();
    return NextResponse.json({
      ok: true,
      dryRun,
      processed: unchecked.length,
      accepted,
      acceptedBySku,
      acceptedByName,
      invalidatedNotStocked,
      leftForReview,
      skippedNoStorefront,
      remainingCount,
      perSeller,
      // cap detail rows so huge runs stay readable
      acceptedSample: acceptedRows.slice(0, 200),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("auto-validate API error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
