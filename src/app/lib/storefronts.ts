import pLimit from "p-limit";

import {
  fetchShopifyProductFeed,
  normalizeShopifySku,
  type ShopifyFeedProduct,
  type ShopifyFeedVariant,
} from "@/app/lib/shopify";
import {
  matchShopifyProductsAgainstCatalogue,
  buildShopifyProductUrl,
  type ShopifyMatchSummary,
  type ShopifyMatchReason,
} from "@/app/lib/shopify-catalogue";

export type StorefrontPlatform = "shopify" | "woocommerce" | "misc";
export type StorefrontMatchStrategy = "name" | "sku-from-page";

export type SellerStorefrontConfig = {
  platform: StorefrontPlatform;
  matchStrategy?: StorefrontMatchStrategy;
  maxFeedPages?: number;
};

export type StorefrontPriceMatch = {
  price: number | null;
  compareAtPrice: number | null;
  image: string | null;
  url: string | null;
  title: string;
  handle?: string;
  confidence: number;
  reason: ShopifyMatchReason | "unknown";
  variantTitle?: string | null;
};

export type StorefrontIndexReady = {
  status: "ready";
  platform: StorefrontPlatform;
  config: SellerStorefrontConfig;
  matches: Map<number, StorefrontPriceMatch>;
  diagnostics: string[];
};

export type StorefrontIndexUnavailable = {
  status: "unavailable";
  platform: StorefrontPlatform;
  config: SellerStorefrontConfig;
  diagnostics: string[];
  fallbackOption?: {
    message: string;
    skuExample?: { raw: string; normalized: string | null };
  };
};

export type StorefrontIndexResult =
  | StorefrontIndexReady
  | StorefrontIndexUnavailable;

type FetchLike = typeof fetch;

type SellerRow = {
  id: number;
  name?: string | null;
  base_url?: string | null;
  storefront?: unknown;
};

const JSON_LD_REGEX =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function coercePlatform(value: string | null | undefined): StorefrontPlatform {
  switch ((value ?? "").toLowerCase()) {
    case "shopify":
      return "shopify";
    case "woocommerce":
      return "woocommerce";
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

function pickVariantForPricing(
  variants: ShopifyFeedVariant[],
): ShopifyFeedVariant | null {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  return (
    variants.find((variant) => variant.available && variant.price != null) ??
    variants.find((variant) => variant.price != null) ??
    variants[0] ??
    null
  );
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

async function ensureSkuForProducts(
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

function buildMatchesFromSummary(
  summary: ShopifyMatchSummary,
  products: ShopifyFeedProduct[],
): Map<number, StorefrontPriceMatch> {
  const map = new Map<number, StorefrontPriceMatch>();
  summary.products.forEach((result, index) => {
    const product = products[index];
    if (!result?.bestCandidate) return;
    const idNum = Number(result.bestCandidate.canonicalProductId);
    if (!Number.isFinite(idNum)) return;
    const variant = pickVariantForPricing(product?.variants ?? []);
    const price = variant?.price ?? null;
    const compareAt = variant?.compareAtPrice ?? null;
    const image = product?.image ?? null;
    const url = product?.productUrl ?? null;
    map.set(idNum, {
      price,
      compareAtPrice: compareAt,
      image,
      url,
      title: product?.title ?? result?.title ?? "",
      handle: product?.handle,
      confidence: result.bestCandidate.confidence,
      reason: result.bestCandidate.reason,
      variantTitle: variant?.title ?? null,
    });
  });
  return map;
}

async function buildShopifyIndex(
  seller: SellerRow,
  config: SellerStorefrontConfig,
  fetchImpl: FetchLike,
): Promise<StorefrontIndexResult> {
  const baseUrl = typeof seller.base_url === "string" ? seller.base_url : "";
  if (!baseUrl) {
    return {
      status: "unavailable",
      platform: "shopify",
      config,
      diagnostics: [
        `Seller ${seller.id} is missing a base_url, skipping Shopify feed sync`,
      ],
      fallbackOption: {
        message: "Provide a base_url to enable Shopify feed sync for this seller.",
      },
    };
  }

  const feedResult = await fetchShopifyProductFeed(baseUrl, {
    fetchImpl,
    maxPages: config.maxFeedPages,
  });

  if (!feedResult.ok) {
    return {
      status: "unavailable",
      platform: "shopify",
      config,
      diagnostics: [
        `Shopify feed for ${seller.name ?? seller.id} failed: ${feedResult.error}`,
      ],
      fallbackOption: {
        message:
          "Switch this seller to matchStrategy=\"sku-from-page\" to extract SKUs from product HTML, or fall back to the legacy scraper.",
        skuExample: {
          raw: "prod4780167-99120218061",
          normalized: normalizeShopifySku("prod4780167-99120218061"),
        },
      },
    };
  }

  const products = feedResult.products.map((product) => ({
    ...product,
    productUrl: product.productUrl ?? buildShopifyProductUrl(baseUrl, product.handle),
  }));

  if ((config.matchStrategy ?? "name") === "sku-from-page") {
    await ensureSkuForProducts(products, baseUrl, fetchImpl);
  }

  const summary = matchShopifyProductsAgainstCatalogue(products, {
    baseUrl,
  });

  const matches = buildMatchesFromSummary(summary, products);
  if (!matches.size) {
    return {
      status: "unavailable",
      platform: "shopify",
      config,
      diagnostics: [
        `Shopify feed for ${seller.name ?? seller.id} returned no confident catalogue matches`,
      ],
      fallbackOption: {
        message:
          "Consider enabling matchStrategy=\"sku-from-page\" so we can lift the manufacturer SKU from the product page JSON-LD before matching.",
        skuExample: {
          raw: "prod4780167-99120218061",
          normalized: normalizeShopifySku("prod4780167-99120218061"),
        },
      },
    };
  }

  return {
    status: "ready",
    platform: "shopify",
    config,
    matches,
    diagnostics: summary.products
      .filter((result) => !result.bestCandidate)
      .map(
        (result) =>
          `No confident match for ${result.title} (${result.handle}) from ${seller.name ?? seller.id}`,
      ),
  };
}

export async function buildStorefrontIndex(
  seller: SellerRow,
  fetchImpl: FetchLike = fetch,
): Promise<StorefrontIndexResult | null> {
  const config = parseSellerStorefront(seller?.storefront);
  if (!config || config.platform === "misc") {
    return null;
  }

  switch (config.platform) {
    case "shopify":
      return buildShopifyIndex(seller, config, fetchImpl);
    case "woocommerce":
      return {
        status: "unavailable",
        platform: "woocommerce",
        config,
        diagnostics: [
          "WooCommerce integration is not yet implemented. Configure storefront.platform=\"shopify\" or leave it as \"misc\" to continue using the legacy scraper.",
        ],
      };
    default:
      return null;
  }
}
