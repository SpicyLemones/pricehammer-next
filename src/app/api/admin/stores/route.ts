// src/app/api/admin/stores/route.ts
//
// Store management:
//   GET  — list sellers with status + price-pair coverage
//   POST — add a store by URL. Probes reachability, auto-detects the
//          ecommerce platform (Shopify / WooCommerce / other), inserts the
//          seller with a generated config, and seeds price pairs for every
//          product. Feed-capable stores need ZERO manual selector work:
//
//            curl -u U:P -X POST /api/admin/stores \
//              -H 'content-type: application/json' \
//              -d '{"url":"https://somestore.com.au","name":"Some Store"}'
//
//          Then run /api/auto-validate?seller=<id> to pull prices.
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { isAdminRequest } from "@/lib/auth";
import { probeSellerHealth } from "@/app/lib/seller-health";
import { logAudit } from "@/app/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type DetectedPlatform = {
  platform: "shopify" | "woocommerce" | "misc";
  detail: string;
};

async function probeJson(url: string): Promise<unknown | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        cache: "no-store",
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!/json/i.test(ct)) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function detectPlatform(baseUrl: string): Promise<DetectedPlatform> {
  const clean = baseUrl.replace(/\/+$/, "");

  const shopify = await probeJson(`${clean}/products.json?limit=1`);
  if (
    shopify &&
    typeof shopify === "object" &&
    Array.isArray((shopify as Record<string, unknown>).products)
  ) {
    return { platform: "shopify", detail: "products.json feed available" };
  }

  const woo = await probeJson(`${clean}/wp-json/wc/store/products?per_page=1`);
  if (Array.isArray(woo)) {
    return { platform: "woocommerce", detail: "wc/store products API available" };
  }

  return {
    platform: "misc",
    detail:
      "no public product feed detected — will need scraper selectors (or the site is bot-walled)",
  };
}

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const rows = await query(
    "all",
    `SELECT s.id, s.name, s.base_url, s.status, s.storefront,
            SUM(CASE WHEN pr.validated = 1 THEN 1 ELSE 0 END) AS validated,
            SUM(CASE WHEN pr.validated IS NULL THEN 1 ELSE 0 END) AS unchecked
     FROM sellers s
     LEFT JOIN prices pr ON pr.seller_id = s.id
     GROUP BY s.id
     ORDER BY s.id`,
  );
  return NextResponse.json({ ok: true, stores: rows });
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { url?: string; name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const rawUrl = (body.url ?? "").trim();
  let origin: URL;
  try {
    origin = new URL(rawUrl);
    if (!/^https?:$/.test(origin.protocol)) throw new Error("bad protocol");
  } catch {
    return NextResponse.json(
      { ok: false, error: `invalid url: ${rawUrl}` },
      { status: 400 },
    );
  }
  const baseUrl = origin.origin;
  const name =
    (body.name ?? "").trim() ||
    origin.hostname.replace(/^www\./, "").replace(/\.(com|net|org)?(\.au)?$/, "");

  // duplicate guard (by host)
  const existing = (await query(
    "all",
    `SELECT id, name, base_url FROM sellers`,
  )) as { id: number; name: string; base_url: string }[];
  const host = origin.hostname.replace(/^www\./, "");
  const dup = existing.find((s) => {
    try {
      return new URL(s.base_url).hostname.replace(/^www\./, "") === host;
    } catch {
      return false;
    }
  });
  if (dup) {
    return NextResponse.json(
      { ok: false, error: `store already exists: ${dup.name} (id ${dup.id})` },
      { status: 409 },
    );
  }

  const health = await probeSellerHealth(baseUrl);
  if (health.status === "down") {
    return NextResponse.json(
      { ok: false, error: `site unreachable (${health.detail}) — not adding` },
      { status: 422 },
    );
  }

  const detected = await detectPlatform(baseUrl);
  const status = health.status === "blocked" ? "blocked" : "active";
  const storefront =
    detected.platform === "misc"
      ? { platform: "misc" }
      : { platform: detected.platform, matchStrategy: "name" };

  await query(
    "run",
    `INSERT INTO sellers (name, base_url, search_url, product_selector, name_selector,
       link_selector, price_selector, sale_selector, image_selector, storefront, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, baseUrl, "", "", "", "", "", "", "", JSON.stringify(storefront), status],
  );
  const sellerRow = (await query(
    "get",
    `SELECT id FROM sellers WHERE base_url = ? ORDER BY id DESC`,
    [baseUrl],
  )) as { id: number };
  const sellerId = sellerRow.id;

  // seed a price pair for every product
  await query(
    "run",
    `INSERT OR IGNORE INTO prices (seller_id, product_id)
     SELECT ?, id FROM products`,
    [sellerId],
  );
  const seeded = (await query(
    "get",
    `SELECT COUNT(*) AS c FROM prices WHERE seller_id = ?`,
    [sellerId],
  )) as { c: number };

  await logAudit("admin", "store-add", { id: sellerId, name, baseUrl, platform: detected.platform });
  return NextResponse.json({
    ok: true,
    store: { id: sellerId, name, baseUrl, status },
    detected,
    seededPairs: seeded.c,
    nextStep:
      detected.platform === "misc"
        ? "No feed found — add scraper selectors to this seller before prices can be collected."
        : `Run POST /api/auto-validate?seller=${sellerId} to pull prices from the ${detected.platform} feed.`,
  });
}
