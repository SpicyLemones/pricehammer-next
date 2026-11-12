// src/app/lib/store-search.ts
//
// Find candidate listings for a product at one seller using the store's OWN
// search API: no headless browser, no HTML scraping, no bot walls.
//
//   shopify     -> /search/suggest.json (Shopify predictive search, public)
//   woocommerce -> /wp-json/wc/store/products?search= (Woo Store API, public)
//   gw-algolia  -> the Algolia index behind warhammer.com search
//   misc        -> no public API; the reviewer pastes a link by hand
//
// Each call is one HTTP request (~0.2–1s), so the /tinder review queue
// loads in about a second instead of launching Chromium for every product.
// Candidates are scored against the product (SKU match first, then the same
// title matcher auto-validate uses) and sorted best-first.

import { normalizeShopifySku } from "@/app/lib/shopify";
import { scoreTitleAgainstName } from "@/app/lib/shopify-catalogue";
import { normalizeWooItem, type WooItem } from "@/app/lib/woocommerce";
import { searchGwCatalogue } from "@/app/lib/gw-algolia";
import { parseSellerStorefront, type StorefrontPlatform } from "@/app/lib/storefronts";

export type StoreCandidate = {
  title: string;
  link: string;
  price: number | null;
  img: string | null;
  sku: string | null;
  available: boolean | null;
  /** 0..1 — 1 means the SKU matched the product's canonical SKU */
  score: number;
  reason: "sku" | "name";
};

export type StoreSearchResult = {
  platform: StorefrontPlatform | "none";
  candidates: StoreCandidate[];
  /** Human-readable note when the search couldn't run or found nothing */
  note?: string;
};

type SellerLike = { id?: number; name?: string | null; base_url?: string | null; storefront?: unknown };
type ProductLike = { id?: number; name: string; search_term?: string | null };

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESULTS = 10;
const UA = "PriceHammer/1.0 (+https://spycy.fun/price-lookup)";

const isSanePrice = (n: number | null): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0.5 && n <= 5000;

function toPrice(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return isSanePrice(n) ? n : null;
}

function absolute(url: string | null | undefined, base: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, base);
    // Shopify predictive search appends tracking params (_pos, _sid, _ss)
    for (const k of [...u.searchParams.keys()]) {
      if (k.startsWith("_")) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return null;
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

type RawCandidate = Omit<StoreCandidate, "score" | "reason">;

/* ---------------- Shopify ---------------- */

type ShopifySuggestVariant = { sku?: string | null; price?: string | number | null; available?: boolean };
type ShopifySuggestProduct = {
  title?: string;
  url?: string;
  handle?: string;
  price?: string | number;
  price_min?: string | number;
  image?: string | null;
  featured_image?: { url?: string } | null;
  available?: boolean;
  variants?: ShopifySuggestVariant[];
};

async function searchShopify(baseUrl: string, term: string): Promise<RawCandidate[]> {
  const origin = new URL(baseUrl).origin;
  const u = new URL("/search/suggest.json", origin);
  u.searchParams.set("q", term);
  u.searchParams.set("resources[type]", "product");
  u.searchParams.set("resources[limit]", String(MAX_RESULTS));
  u.searchParams.set("resources[options][unavailable_products]", "last");
  // search SKUs and variant titles too, not just product titles
  u.searchParams.set("resources[options][fields]", "title,product_type,variants.title,variants.sku,vendor,tag");

  const data = (await getJson(u.toString())) as {
    resources?: { results?: { products?: ShopifySuggestProduct[] } };
  };
  const products = data?.resources?.results?.products ?? [];

  return products
    .map((p): RawCandidate | null => {
      const link = absolute(p.url ?? (p.handle ? `/products/${p.handle}` : null), origin);
      if (!link) return null;
      const variants = Array.isArray(p.variants) ? p.variants : [];
      const v = variants.find((x) => x.available && x.price != null) ?? variants[0];
      return {
        title: String(p.title ?? ""),
        link,
        price: toPrice(v?.price ?? p.price ?? p.price_min),
        img: absolute(p.image ?? p.featured_image?.url ?? null, origin),
        sku: variants.find((x) => x.sku)?.sku ?? null,
        available: typeof p.available === "boolean" ? p.available : null,
      };
    })
    .filter((c): c is RawCandidate => c !== null);
}

/* ---------------- WooCommerce ---------------- */

async function searchWoo(baseUrl: string, term: string): Promise<RawCandidate[]> {
  const u = new URL("/wp-json/wc/store/products", new URL(baseUrl).origin);
  u.searchParams.set("search", term);
  u.searchParams.set("per_page", String(MAX_RESULTS));
  const data = (await getJson(u.toString())) as WooItem[];
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => normalizeWooItem(item))
    .filter((p) => p.productUrl)
    .map((p) => ({
      title: p.title,
      link: p.productUrl!,
      price: toPrice(p.variants[0]?.price),
      img: p.image ?? null,
      sku: p.variants[0]?.sku ?? null,
      available: p.variants[0]?.available ?? null,
    }));
}

/* ---------------- Games Workshop ---------------- */

async function searchGw(term: string): Promise<RawCandidate[]> {
  const hits = await searchGwCatalogue(term, MAX_RESULTS);
  return hits
    .filter((h) => h.url)
    .map((h) => ({
      title: h.name ?? "",
      link: h.url!,
      price: toPrice(h.price),
      img: h.image,
      sku: h.sku,
      available: null,
    }));
}

/* ---------------- scoring ---------------- */

function scoreCandidates(
  raw: RawCandidate[],
  product: ProductLike,
  productSkus: Set<string>,
): StoreCandidate[] {
  const names = [product.name, product.search_term].filter(
    (n): n is string => typeof n === "string" && n.trim() !== "",
  );
  const seen = new Set<string>();
  const out: StoreCandidate[] = [];
  for (const c of raw) {
    if (seen.has(c.link)) continue;
    seen.add(c.link);
    const norm = normalizeShopifySku(c.sku);
    if (norm && productSkus.has(norm)) {
      out.push({ ...c, score: 1, reason: "sku" });
      continue;
    }
    const score = Math.max(0, ...names.map((n) => scoreTitleAgainstName(c.title, n)));
    out.push({ ...c, score, reason: "name" });
  }
  // best match first; among equals, in-stock and priced listings first
  return out.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.available !== false) - Number(a.available !== false) ||
      Number(b.price != null) - Number(a.price != null),
  );
}

/**
 * Search one seller for a product. Never throws: failures come back as an
 * empty candidate list with a note explaining why.
 */
export async function searchStore(
  seller: SellerLike,
  product: ProductLike,
  opts: { term?: string; productSkus?: Iterable<string> } = {},
): Promise<StoreSearchResult> {
  const term = (opts.term || product.search_term || product.name || "").trim();
  const config = parseSellerStorefront(seller?.storefront);
  const platform = config?.platform ?? "misc";
  const baseUrl = String(seller?.base_url ?? "");
  const skus = new Set(
    [...(opts.productSkus ?? [])]
      .map((s) => normalizeShopifySku(s))
      .filter((s): s is string => Boolean(s)),
  );

  if (!term) return { platform, candidates: [], note: "product has no name or search term" };

  try {
    let raw: RawCandidate[];
    switch (platform) {
      case "shopify":
        raw = await searchShopify(baseUrl, term);
        break;
      case "woocommerce":
        raw = await searchWoo(baseUrl, term);
        break;
      case "gw-algolia":
        raw = await searchGw(term);
        break;
      default:
        return {
          platform,
          candidates: [],
          note: "this store has no public product API — open the store, find the item, and paste its link and price below",
        };
    }
    const candidates = scoreCandidates(raw, product, skus);
    return {
      platform,
      candidates,
      note: candidates.length ? undefined : `no results for "${term}" — try an alternate search term`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { platform, candidates: [], note: `${platform} search failed (${msg})` };
  }
}
