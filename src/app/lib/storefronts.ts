// src/app/lib/storefronts.ts
// Seller storefront config (which product API a store exposes) and small
// shared helpers. Fetching + matching live in listings.ts.
import pLimit from "p-limit";

import { normalizeShopifySku, type ShopifyFeedProduct } from "@/app/lib/shopify";
import { buildShopifyProductUrl } from "@/app/lib/shopify-catalogue";

export type StorefrontPlatform = "shopify" | "woocommerce" | "gw-algolia" | "misc";
export type StorefrontMatchStrategy = "name" | "sku-from-page";

export type SellerStorefrontConfig = {
  platform: StorefrontPlatform;
  matchStrategy?: StorefrontMatchStrategy;
  maxFeedPages?: number;
};

/** Normalize a product URL into a stable lookup key (host + path, lowercased). */
export function normalizeProductUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return null;
  }
}

type FetchLike = typeof fetch;

const JSON_LD_REGEX =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function coercePlatform(value: string | null | undefined): StorefrontPlatform {
  switch ((value ?? "").toLowerCase()) {
    case "shopify":
      return "shopify";
    case "woocommerce":
      return "woocommerce";
    case "gw-algolia":
    case "gw":
      return "gw-algolia";
    default:
      return "misc";
  }
}

function coerceMatchStrategy(
  value: string | null | undefined,
): StorefrontMatchStrategy | undefined {
  if (!value) return undefined;
  const trimmed = value.toLowerCase();
  if (trimmed === "name") return "name";
  if (trimmed === "sku-from-page" || trimmed === "sku" || trimmed === "sku-page") {
    return "sku-from-page";
  }
  return undefined;
}

function parseUnknownJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseSellerStorefront(
  raw: unknown,
): SellerStorefrontConfig | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return parseSellerStorefront(parseUnknownJson(trimmed));
    }
    return { platform: coercePlatform(trimmed) };
  }
  if (typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  const platform = coercePlatform(
    typeof record.platform === "string" ? record.platform : null,
  );
  const config: SellerStorefrontConfig = { platform };

  if (typeof record.maxFeedPages === "number") {
    if (Number.isFinite(record.maxFeedPages) && record.maxFeedPages > 0) {
      config.maxFeedPages = Math.floor(record.maxFeedPages);
    }
  } else if (typeof record.maxFeedPages === "string") {
    const parsed = Number(record.maxFeedPages);
    if (Number.isFinite(parsed) && parsed > 0) {
      config.maxFeedPages = Math.floor(parsed);
    }
  }

  const strategy =
    coerceMatchStrategy(typeof record.matchStrategy === "string" ? record.matchStrategy : null) ??
    (platform === "shopify" ? "name" : undefined);
  if (strategy) config.matchStrategy = strategy;

  return config;
}

function findSkuInJsonLd(node: unknown): string | null {
  if (!node) return null;
  if (typeof node === "string") {
    return normalizeShopifySku(node);
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findSkuInJsonLd(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (typeof record.sku === "string") {
      const normalized = normalizeShopifySku(record.sku);
      if (normalized) return normalized;
    }
    if (record["@graph"] != null) {
      const found = findSkuInJsonLd(record["@graph"]);
      if (found) return found;
    }
    if (record.offers != null) {
      const found = findSkuInJsonLd(record.offers);
      if (found) return found;
    }
    if (record.item != null) {
      const found = findSkuInJsonLd(record.item);
      if (found) return found;
    }
    if (record["@type"] != null) {
      const typeValue = record["@type"];
      const matchesProduct = Array.isArray(typeValue)
        ? typeValue.some((entry) =>
            typeof entry === "string" && /product/i.test(entry),
          )
        : typeof typeValue === "string" && /product/i.test(typeValue);
      if (matchesProduct && typeof record.identifier === "string") {
        const normalized = normalizeShopifySku(record.identifier);
        if (normalized) return normalized;
      }
    }
    for (const value of Object.values(record)) {
      const found = findSkuInJsonLd(value);
      if (found) return found;
    }
  }
  return null;
}

async function fetchSkuFromProductPage(
  url: string,
  fetchImpl: FetchLike,
): Promise<string | null> {
  try {
    const res = await fetchImpl(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    let match: RegExpExecArray | null;
    while ((match = JSON_LD_REGEX.exec(html))) {
      const raw = match[1]?.trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const sku = findSkuInJsonLd(parsed);
        if (sku) return sku;
      } catch {
        // ignore malformed JSON-LD chunks
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function ensureSkuForProducts(
  products: ShopifyFeedProduct[],
  baseUrl: string,
  fetchImpl: FetchLike,
) {
  const limiter = pLimit(3);
  await Promise.all(
    products.map((product) =>
      limiter(async () => {
        const needsSku = product.variants.every((variant) => !variant.normalizedSku);
        if (!needsSku) return;
        const url = product.productUrl ?? buildShopifyProductUrl(baseUrl, product.handle);
        if (!url) return;
        const sku = await fetchSkuFromProductPage(url, fetchImpl);
        if (!sku) return;
        for (const variant of product.variants) {
          if (!variant.sku) {
            variant.sku = sku;
          }
          if (!variant.normalizedSku) {
            variant.normalizedSku = normalizeShopifySku(sku);
          }
        }
      }),
    ),
  );
}
