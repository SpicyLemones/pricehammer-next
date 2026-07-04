// src/app/lib/woocommerce.ts
// WooCommerce public Store API feed, normalized to the shared feed-product
// shape (ShopifyFeedProduct) so the SKU/name matcher works unchanged.
//
// Endpoint: /wp-json/wc/store/products — public on most Woo shops, paginated
// (max 100 per page), no auth required. Prices arrive in minor units.

import {
  normalizeShopifySku,
  type ShopifyFeedProduct,
  type ShopifyFeedResult,
} from "@/app/lib/shopify";

type FetchLike = typeof fetch;

const DEFAULT_MAX_PAGES = 200; // 100/page -> up to 20k products
const PER_PAGE = 100;

type WooImage = { src?: string; alt?: string };
type WooPrices = {
  price?: string;
  regular_price?: string;
  sale_price?: string;
  currency_minor_unit?: number;
};
type WooItem = {
  id?: number | string;
  name?: string;
  slug?: string;
  permalink?: string;
  sku?: string;
  is_in_stock?: boolean;
  prices?: WooPrices;
  images?: WooImage[];
  categories?: { name?: string }[];
};

function minorToMajor(value: string | undefined, minorUnit: number): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n / Math.pow(10, minorUnit);
}

function normalizeItem(item: WooItem): ShopifyFeedProduct {
  const minorUnit = item.prices?.currency_minor_unit ?? 2;
  const price = minorToMajor(item.prices?.price, minorUnit);
  const regular = minorToMajor(item.prices?.regular_price, minorUnit);
  const sku = typeof item.sku === "string" && item.sku.trim() ? item.sku.trim() : null;

  return {
    id: item.id ?? "",
    handle: item.slug ?? "",
    title: item.name ?? "",
    productType: item.categories?.[0]?.name,
    variants: [
      {
        id: item.id ?? "",
        title: item.name ?? "",
        sku,
        normalizedSku: normalizeShopifySku(sku),
        price,
        compareAtPrice: regular != null && regular !== price ? regular : null,
        available: item.is_in_stock !== false,
      },
    ],
    image: item.images?.[0]?.src ?? null,
    productUrl: item.permalink ?? null,
  };
}

export async function fetchWooCommerceProductFeed(
  baseUrl: string,
  opts: { fetchImpl?: FetchLike; maxPages?: number } = {},
): Promise<ShopifyFeedResult> {
  let origin: URL;
  try {
    origin = new URL(baseUrl);
  } catch {
    return { ok: false, error: `Invalid WooCommerce base URL: ${baseUrl}` };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxPages = Math.max(1, opts.maxPages ?? DEFAULT_MAX_PAGES);

  const products: ShopifyFeedProduct[] = [];
  let pageCount = 0;
  let requestCount = 0;

  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await new Promise((r) => setTimeout(r, 300));

    const url = new URL("/wp-json/wc/store/products", origin);
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));

    let res: Response | null = null;
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetchImpl(url.toString(), {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
      } catch (error) {
        lastError = (error as Error)?.message || String(error);
        res = null;
        break;
      }
      requestCount++;
      if (res.status !== 429) break;
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 3000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    if (!res) {
      return { ok: false, error: `Failed to fetch WooCommerce feed (${lastError})` };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `WooCommerce returned ${res.status} ${res.statusText || ""}`.trim(),
      };
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (error) {
      return {
        ok: false,
        error: `Failed to parse WooCommerce JSON (${(error as Error)?.message || error})`,
      };
    }
    if (!Array.isArray(data)) {
      return { ok: false, error: "Unexpected WooCommerce response (expected array)" };
    }
    if (data.length === 0) break;

    for (const item of data as WooItem[]) products.push(normalizeItem(item));
    pageCount++;
    if (data.length < PER_PAGE) break;
  }

  return {
    ok: true,
    source: "rest_products_json",
    products,
    pageCount,
    requestCount,
  };
}
