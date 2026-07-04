import {
  loadSkuCatalogue,
  type SkuCatalogueRecord,
} from "@/app/lib/sku-catalogue";
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
  productId: string;
  canonicalSku: string | null;
  skuSet: Set<string>;
  tokens: Set<string>;
  nameVariants: string[];
  image?: string;
  name: string;
};

// NOTE: deliberately does NOT include distinguishing words like "battleforce",
// "army", "starter", "bundle" — stripping those makes a Battleforce box look
// identical to the base unit kit and causes wrong matches.
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
  "citadel",
  "gw",
  "40k",
  "40000",
  "aos",
  "sigmar",
  "preorder",
  "pre-order",
  "edition",
  "new",
  "plastic",
  "kit",
  "miniatures",
  "miniature",
]);

// Reduce simple plurals so "Necron Warriors" matches "Necron Warrior".
function singularize(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function normalizeNameForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ") // "[PRE-ORDER]" style prefixes
    .replace(/\([^)]*\)/g, " ")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((part) => part && !STOP_WORDS.has(part))
    .map(singularize)
    .join(" ");
}

function toTokenSet(value: string): Set<string> {
  const norm = normalizeNameForMatch(value);
  const tokens = norm.split(" ").filter(Boolean);
  return new Set(tokens);
}

// Dice coefficient over token sets (0..1). Preferred over Jaccard because it
// is gentler on size differences between short canonical names and long,
// prefix-laden retailer titles.
function diceScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  return (2 * intersection) / (a.size + b.size);
}

// Containment: how much of the canonical name appears in the retailer title.
// Retailer titles are typically longer ("Warhammer 40k - Astra Militarum -
// Ciaphas Cain"), so recall of OUR tokens is the strong signal.
function containmentScore(canonical: Set<string>, retailer: Set<string>): number {
  if (canonical.size === 0) return 0;
  let hit = 0;
  for (const token of canonical) {
    if (retailer.has(token)) hit++;
  }
  return hit / canonical.size;
}

// Products from a different scale/system line: if the retailer title carries
// one of these markers and the canonical name doesn't, it is a different
// physical product (e.g. the Legions Imperialis epic-scale reissue of a kit).
const SYSTEM_MARKERS = [
  "legions",
  "imperialis",
  "epic",
  "underworlds",
  "warcry",
  "necromunda",
].map(singularize);

/**
 * Similarity between a retailer page title and a canonical product name,
 * using the same normalization as feed matching (0..1). Used by the
 * link-verification job for stores that publish no SKU.
 */
export function scoreTitleAgainstName(pageTitle: string, productName: string): number {
  const titleTokens = toTokenSet(pageTitle);
  const nameTokens = toTokenSet(productName);
  if (!titleTokens.size || !nameTokens.size) return 0;
  let s = diceScore(nameTokens, titleTokens);
  if (nameTokens.size >= 2) {
    s = Math.max(s, 0.92 * containmentScore(nameTokens, titleTokens));
    const a = [...nameTokens].sort().join(" ");
    const b = [...titleTokens].sort().join(" ");
    if (a === b) s = 1;
  } else {
    // single-word names can't be verified strongly, but if the word IS in the
    // title ("Genestealer Cults: Aberrants" vs "Aberrants") that's not
    // evidence of a WRONG link either — park it in the unclear zone.
    if (containmentScore(nameTokens, titleTokens) >= 1) s = Math.max(s, 0.75);
    s = Math.min(s, 0.75);
  }
  return s;
}

function buildCanonicalEntry(record: SkuCatalogueRecord): CanonicalEntry {
  const name = record.name || record.nameAliases[0] || "";
  const skuSet = new Set<string>();

  const canonicalSku = normalizeShopifySku(record.canonicalSku);
  if (canonicalSku) skuSet.add(canonicalSku);
  for (const alias of record.skuAliases) {
    const normalized = normalizeShopifySku(alias);
    if (normalized) skuSet.add(normalized);
  }

  const nameVariants = new Set<string>();
  if (name) nameVariants.add(name);
  if (record.searchTerm) nameVariants.add(record.searchTerm);
  for (const alias of record.nameAliases) nameVariants.add(alias);

  const tokens = new Set<string>();
  for (const variantName of nameVariants) {
    if (!variantName) continue;
    for (const token of toTokenSet(variantName)) tokens.add(token);
  }

  return {
    productId: record.productId,
    canonicalSku,
    skuSet,
    tokens,
    nameVariants: Array.from(nameVariants).filter(Boolean),
    image: record.image ?? undefined,
    name,
  };
}

type CanonicalIndex = {
  entries: CanonicalEntry[];
  bySku: Map<string, CanonicalEntry>;
};

// Built lazily from the DB-backed SKU catalogue; loadSkuCatalogue caches for
// 5 minutes, so rebuilding here is cheap and stays fresh after syncs.
async function getCanonicalIndex(): Promise<CanonicalIndex> {
  const records = await loadSkuCatalogue();
  const entries = records.map(buildCanonicalEntry);
  const bySku = new Map<string, CanonicalEntry>();
  for (const entry of entries) {
    for (const sku of entry.skuSet) bySku.set(sku, entry);
  }
  return { entries, bySku };
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

// Retailer product types that are NOT the miniature kit itself: a novel,
// paint, or dice set whose title contains a kit name must never outrank the
// real kit ("Ciaphas Cain - For The Emperor (Hardback)" vs the model).
const NON_KIT_TYPE = /book|novel|black library|paint|dice|audio|magazine|puzzle|apparel|mug|print/i;

function computeNameScore(
  entry: CanonicalEntry,
  product: ShopifyFeedProduct,
): number {
  const titleTokens = toTokenSet(product.title);
  const handleTokens = toTokenSet(product.handle.replace(/[-_]+/g, " "));
  const retailerAll = new Set([...titleTokens, ...handleTokens]);

  const markerMismatch = SYSTEM_MARKERS.some(
    (mk) => retailerAll.has(mk) && !entry.tokens.has(mk),
  );
  const nonKitType = NON_KIT_TYPE.test(product.productType ?? "");

  const scoreAgainst = (canonicalTokens: Set<string>): number => {
    if (canonicalTokens.size === 0) return 0;
    let s = Math.max(
      diceScore(canonicalTokens, titleTokens),
      diceScore(canonicalTokens, handleTokens),
    );
    // exact normalized-name equality (multi-word) → certain
    if (canonicalTokens.size >= 2) {
      const canonicalKey = [...canonicalTokens].sort().join(" ");
      const titleKey = [...titleTokens].sort().join(" ");
      if (canonicalKey === titleKey) s = 1;
      // containment bonus: our short name fully present in their long title
      s = Math.max(s, 0.92 * containmentScore(canonicalTokens, retailerAll));
    } else {
      // single generic words (Ancient, Chosen, Apothecary…) are too ambiguous
      s = Math.min(s, 0.75);
    }
    if (markerMismatch) s = Math.min(s, 0.7);
    if (nonKitType) s = Math.min(s, 0.7);
    return s;
  };

  let best = scoreAgainst(entry.tokens);
  for (const alias of entry.nameVariants) {
    best = Math.max(best, scoreAgainst(toTokenSet(alias)));
  }
  return best;
}

export async function matchShopifyProductsAgainstCatalogue(
  products: ShopifyFeedProduct[],
  opts: {
    baseUrl?: string | null;
    maxFuzzyCandidates?: number;
    minFuzzyScore?: number;
  } = {},
): Promise<ShopifyMatchSummary> {
  const maxFuzzyCandidates = opts.maxFuzzyCandidates ?? 3;
  const minFuzzyScore = opts.minFuzzyScore ?? 0.55;
  const baseUrl = opts.baseUrl ?? null;

  const { entries: canonicalEntries, bySku: canonicalBySku } = await getCanonicalIndex();

  const results: ShopifyMatchResult[] = [];
  let matchedBySku = 0;
  let matchedByName = 0;

  for (const product of products) {
    const variantSkus = aggregateVariantSkus(product.variants);
    const unmatchedSkus: string[] = [];
    const candidates: ShopifyMatchCandidate[] = [];

    for (const variant of variantSkus) {
      if (!variant.normalized) continue;
      const canonical = canonicalBySku.get(variant.normalized);
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
      for (const entry of canonicalEntries) {
        const score = computeNameScore(entry, product);
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
          // confidence IS the name score — downstream consumers gate on it
          // (auto-validate accepts >= 0.85), so don't inflate it.
          confidence: Math.min(0.99, score),
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
