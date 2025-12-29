import { Products } from "../../../data/db/Product";
import {
  ProductSkuCatalogue,
  type ProductSkuCatalogueEntry,
} from "../../../data/db/product-skus";
import {
  normalizeShopifySku,
  type ShopifyFeedProduct,
  type ShopifyFeedVariant,
} from "@/app/lib/shopify";

export type ShopifyMatchReason = "sku" | "fuzzy-name";

export type ShopifyMatchCandidate = {
  canonicalProductId: string;
  canonicalName: string;
  canonicalSku: string | null;
  reason: ShopifyMatchReason;
  confidence: number;
  matchedSku?: string | null;
  nameScore?: number;
  productUrl?: string;
  image?: string | null;
};

export type ShopifyVariantSku = {
  title: string;
  raw: string | null;
  normalized: string | null;
  available: boolean;
};

export type ShopifyMatchResult = {
  shopifyId: string | number;
  handle: string;
  title: string;
  vendor?: string;
  variantSkus: ShopifyVariantSku[];
  bestCandidate: ShopifyMatchCandidate | null;
  candidates: ShopifyMatchCandidate[];
  unmatchedSkus: string[];
  image?: string | null;
  productUrl?: string | null;
};

export type ShopifyMatchSummary = {
  stats: {
    totalProducts: number;
    matchedBySku: number;
    matchedByName: number;
    unmatched: number;
  };
  products: ShopifyMatchResult[];
};

type CanonicalEntry = {
  catalogue: ProductSkuCatalogueEntry;
  productId: string;
  canonicalSku: string | null;
  skuSet: Set<string>;
  tokens: Set<string>;
  nameVariants: string[];
  image?: string;
  name: string;
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "of",
  "for",
  "with",
  "set",
  "box",
  "warhammer",
  "games",
  "workshop",
  "preorder",
  "pre-order",
  "edition",
  "battleforce",
  "army",
  "starter",
  "bundle",
]);

function normalizeNameForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((part) => part && !STOP_WORDS.has(part))
    .join(" ");
}

function toTokenSet(value: string): Set<string> {
  const norm = normalizeNameForMatch(value);
  const tokens = norm.split(" ").filter(Boolean);
  return new Set(tokens);
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function buildCanonicalEntries(): CanonicalEntry[] {
  const productsById = new Map(Products.map((p) => [p.id, p] as const));

  return ProductSkuCatalogue.map((entry) => {
    const product = productsById.get(entry.productId);
    const name = product?.name ?? entry.nameAliases?.[0] ?? "";
    const skuSet = new Set<string>();

    const canonicalSku = normalizeShopifySku(entry.canonicalSku);
    if (canonicalSku) skuSet.add(canonicalSku);
    for (const alias of entry.skuAliases ?? []) {
      const normalized = normalizeShopifySku(alias);
      if (normalized) skuSet.add(normalized);
    }

    const nameVariants = new Set<string>();
    if (product?.name) nameVariants.add(product.name);
    for (const alias of entry.nameAliases ?? []) nameVariants.add(alias);

    const tokens = new Set<string>();
    for (const variantName of nameVariants) {
      if (!variantName) continue;
      const variantTokens = toTokenSet(variantName);
      for (const token of variantTokens) tokens.add(token);
    }

    return {
      catalogue: entry,
      productId: entry.productId,
      canonicalSku,
      skuSet,
      tokens,
      nameVariants: Array.from(nameVariants).filter(Boolean),
      image: product?.image,
      name,
    } satisfies CanonicalEntry;
  });
}

const CANONICAL_ENTRIES = buildCanonicalEntries();
const CANONICAL_BY_SKU = new Map<string, CanonicalEntry>();
for (const entry of CANONICAL_ENTRIES) {
  for (const sku of entry.skuSet) {
    CANONICAL_BY_SKU.set(sku, entry);
  }
}

export function buildShopifyProductUrl(
  baseUrl: string | null,
  handle: string,
): string | undefined {
  if (!baseUrl) return undefined;
  try {
    const url = new URL(baseUrl);
    url.pathname = `/products/${handle}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function aggregateVariantSkus(variants: ShopifyFeedVariant[]): ShopifyVariantSku[] {
  return variants.map((variant) => ({
    title: variant.title,
    raw: variant.sku ?? null,
    normalized: normalizeShopifySku(variant.sku),
    available: variant.available,
  }));
}

function dedupeCandidates(candidates: ShopifyMatchCandidate[]): ShopifyMatchCandidate[] {
  const seen = new Map<string, ShopifyMatchCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.canonicalProductId}:${candidate.reason}`;
    const existing = seen.get(key);
    if (!existing || candidate.confidence > existing.confidence) {
      seen.set(key, candidate);
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence);
}

function computeNameScore(
  entry: CanonicalEntry,
  product: ShopifyFeedProduct,
  variantSkus: ShopifyVariantSku[],
): number {
  const productTitleTokens = toTokenSet(product.title);
  const handleTokens = toTokenSet(product.handle.replace(/[-_]+/g, " "));
  let best = jaccardScore(productTitleTokens, entry.tokens);
  best = Math.max(best, jaccardScore(handleTokens, entry.tokens));

  for (const variant of product.variants) {
    const tokens = toTokenSet(variant.title);
    best = Math.max(best, jaccardScore(tokens, entry.tokens));
  }

  for (const alias of entry.nameVariants) {
    const tokens = toTokenSet(alias);
    best = Math.max(best, jaccardScore(tokens, productTitleTokens));
    best = Math.max(best, jaccardScore(tokens, handleTokens));
  }

  const skuTokens = new Set<string>();
  for (const variant of variantSkus) {
    if (variant.normalized) skuTokens.add(variant.normalized);
  }
  if (skuTokens.size > 0 && entry.canonicalSku) {
    const canonicalTokens = new Set<string>([entry.canonicalSku]);
    best = Math.max(best, jaccardScore(skuTokens, canonicalTokens));
  }

  return best;
}

export function matchShopifyProductsAgainstCatalogue(
  products: ShopifyFeedProduct[],
  opts: {
    baseUrl?: string | null;
    maxFuzzyCandidates?: number;
    minFuzzyScore?: number;
  } = {},
): ShopifyMatchSummary {
  const maxFuzzyCandidates = opts.maxFuzzyCandidates ?? 3;
  const minFuzzyScore = opts.minFuzzyScore ?? 0.55;
  const baseUrl = opts.baseUrl ?? null;

  const results: ShopifyMatchResult[] = [];
  let matchedBySku = 0;
  let matchedByName = 0;

  for (const product of products) {
    const variantSkus = aggregateVariantSkus(product.variants);
    const unmatchedSkus: string[] = [];
    const candidates: ShopifyMatchCandidate[] = [];

    for (const variant of variantSkus) {
      if (!variant.normalized) continue;
      const canonical = CANONICAL_BY_SKU.get(variant.normalized);
      if (!canonical) {
        unmatchedSkus.push(variant.normalized);
        continue;
      }
      candidates.push({
        canonicalProductId: canonical.productId,
        canonicalName: canonical.name,
        canonicalSku: canonical.canonicalSku,
        reason: "sku",
        confidence: 1,
        matchedSku: variant.normalized,
        productUrl: buildShopifyProductUrl(baseUrl, product.handle),
        image: canonical.image ?? null,
      });
    }

    const hasSkuCandidate = candidates.some((c) => c.reason === "sku");

    if (!hasSkuCandidate) {
      const scoredEntries: Array<{ entry: CanonicalEntry; score: number }> = [];
      for (const entry of CANONICAL_ENTRIES) {
        const score = computeNameScore(entry, product, variantSkus);
        if (score >= minFuzzyScore) {
          scoredEntries.push({ entry, score });
        }
      }

      scoredEntries.sort((a, b) => b.score - a.score);
      for (const { entry, score } of scoredEntries.slice(0, maxFuzzyCandidates)) {
        candidates.push({
          canonicalProductId: entry.productId,
          canonicalName: entry.name,
          canonicalSku: entry.canonicalSku,
          reason: "fuzzy-name",
          confidence: Math.min(0.95, Math.max(0.6, score)),
          nameScore: score,
          productUrl: buildShopifyProductUrl(baseUrl, product.handle),
          image: entry.image ?? null,
        });
      }
    }

    const deduped = dedupeCandidates(candidates);
    const bestCandidate = deduped[0] ?? null;
    if (bestCandidate?.reason === "sku") matchedBySku++;
    else if (bestCandidate?.reason === "fuzzy-name") matchedByName++;

    results.push({
      shopifyId: product.id,
      handle: product.handle,
      title: product.title,
      vendor: product.vendor,
      variantSkus,
      bestCandidate,
      candidates: deduped,
      unmatchedSkus,
      image: product.image ?? null,
      productUrl: buildShopifyProductUrl(baseUrl, product.handle) ?? undefined,
    });
  }

  return {
    stats: {
      totalProducts: products.length,
      matchedBySku,
      matchedByName,
      unmatched: products.length - matchedBySku - matchedByName,
    },
    products: results,
  };
}
