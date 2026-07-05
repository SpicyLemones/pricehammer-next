// src/app/lib/gw-algolia.ts
//
// Games Workshop price source via the public Algolia index that powers
// warhammer.com search. Deterministic (SKU-keyed), fast, and avoids the
// AWS-WAF-protected website entirely.
//
// Credentials are the public search-only key shipped in warhammer.com's own
// frontend bundle — safe to embed, but override via env if it ever rotates.

import { normalizeShopifySku } from "@/app/lib/shopify";
import { loadSkuCatalogue } from "@/app/lib/sku-catalogue";

const APP_ID = process.env.GW_ALGOLIA_APP_ID || "M5ZIQZNQ2H";
const API_KEY =
  process.env.GW_ALGOLIA_API_KEY || "92c6a8254f9d34362df8e6d96475e5d8";
const INDEX = process.env.GW_ALGOLIA_INDEX || "prod-lazarus-product-en-au";
const SHOP_BASE = "https://www.warhammer.com/en-AU/shop/";

export type GwCatalogueItem = {
  name: string | null;
  slug: string | null;
  sku: string | null;
  normalizedSku: string | null;
  price: number | null;
  productType: string | null;
  image: string | null;
  isNewRelease: boolean;
  isPreOrder: boolean;
  /** Set when fetched via fetchGwCatalogueByGame */
  game?: string;
};

type AlgoliaHit = Record<string, unknown>;
type AlgoliaResponse = {
  hits?: AlgoliaHit[];
  nbHits?: number;
  nbPages?: number;
  facets?: Record<string, Record<string, number>>;
};

type FetchLike = typeof fetch;

async function algoliaQuery(
  params: Record<string, unknown>,
  fetchImpl: FetchLike,
): Promise<AlgoliaResponse> {
  const url = `https://${APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/${INDEX}/query`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "x-algolia-application-id": APP_ID,
      "x-algolia-api-key": API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(params),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GW Algolia HTTP ${res.status}`);
  }
  return (await res.json()) as AlgoliaResponse;
}

function pickItem(hit: AlgoliaHit): GwCatalogueItem {
  const sku = typeof hit.sku === "string" ? hit.sku : null;
  // prefer a static 920x950 render over threeSixty spins
  let image: string | null = null;
  if (Array.isArray(hit.images)) {
    const paths = (hit.images as unknown[]).filter(
      (v): v is string => typeof v === "string",
    );
    const still = paths.find((p) => p.includes("920x950")) ?? paths[0] ?? null;
    image = still ? `https://www.warhammer.com${still}` : null;
  }
  return {
    name: typeof hit.name === "string" ? hit.name : null,
    slug: typeof hit.slug === "string" ? hit.slug : null,
    sku,
    normalizedSku: normalizeShopifySku(sku),
    price: typeof hit.price === "number" ? hit.price : null,
    productType: typeof hit.productType === "string" ? hit.productType : null,
    image,
    isNewRelease: hit.isNewRelease === true,
    isPreOrder: hit.isPreOrder === true,
  };
}

/**
 * Fetch the full GW catalogue. The search API caps pagination at ~1000 hits
 * per filter expression, so partition by productType, then stock status, then
 * game system until every slice fits.
 */
export async function fetchGwCatalogue(
  fetchImpl: FetchLike = fetch,
): Promise<GwCatalogueItem[]> {
  const byKey = new Map<string, GwCatalogueItem>();

  async function fetchPartition(filters: string): Promise<number> {
    const first = await algoliaQuery(
      { query: "", hitsPerPage: 500, page: 0, filters },
      fetchImpl,
    );
    if ((first.nbHits ?? 0) > 1000) return -1;
    const ingest = (r: AlgoliaResponse) => {
      for (const hit of r.hits ?? []) {
        const item = pickItem(hit);
        byKey.set(item.slug ?? item.sku ?? JSON.stringify(item), item);
      }
    };
    ingest(first);
    const pages = first.nbPages ?? 1;
    for (let page = 1; page < pages; page++) {
      ingest(
        await algoliaQuery(
          { query: "", hitsPerPage: 500, page, filters },
          fetchImpl,
        ),
      );
    }
    return first.nbHits ?? 0;
  }

  const probe = await algoliaQuery(
    { query: "", hitsPerPage: 0, facets: ["productType"] },
    fetchImpl,
  );
  const types = Object.keys(probe.facets?.productType ?? {});

  for (const type of types) {
    const base = `productType:"${type}"`;
    if ((await fetchPartition(base)) !== -1) continue;
    for (const stock of ["true", "false"]) {
      const f1 = `${base} AND isInStock:${stock}`;
      if ((await fetchPartition(f1)) !== -1) continue;
      const facetProbe = await algoliaQuery(
        { query: "", hitsPerPage: 0, filters: f1, facets: ["GameSystemsRoot.lvl0"] },
        fetchImpl,
      );
      const systems = Object.keys(facetProbe.facets?.["GameSystemsRoot.lvl0"] ?? {});
      for (const sys of systems) {
        await fetchPartition(
          `${f1} AND GameSystemsRoot.lvl0:"${sys.replace(/"/g, '\\"')}"`,
        );
      }
    }
  }

  return [...byKey.values()];
}

/**
 * Fetch GW catalogue items for specific game systems and product types —
 * used by the catalogue sync to discover new releases. Items are tagged
 * with the game they were fetched under.
 */
export async function fetchGwCatalogueByGame(
  games: string[],
  productTypes: string[],
  fetchImpl: FetchLike = fetch,
): Promise<GwCatalogueItem[]> {
  const byKey = new Map<string, GwCatalogueItem>();

  for (const game of games) {
    const gameFilter = `GameSystemsRoot.lvl0:"${game.replace(/"/g, '\\"')}"`;
    for (const type of productTypes) {
      for (const stock of ["true", "false"]) {
        const filters = `${gameFilter} AND productType:"${type}" AND isInStock:${stock}`;
        let page = 0;
        let nbPages = 1;
        while (page < nbPages) {
          const r = await algoliaQuery(
            { query: "", hitsPerPage: 500, page, filters },
            fetchImpl,
          );
          nbPages = r.nbPages ?? 1;
          for (const hit of r.hits ?? []) {
            const item = pickItem(hit);
            item.game = game;
            byKey.set(item.slug ?? item.sku ?? JSON.stringify(hit).slice(0, 60), item);
          }
          page++;
        }
      }
    }
  }
  return [...byKey.values()];
}

export type GwPriceMatch = {
  productId: number;
  price: number | null;
  url: string | null;
  title: string;
  sku: string | null;
};

/**
 * Resolve prices for our catalogue products by canonical SKU.
 * Returns a map keyed by internal product id.
 */
export async function buildGwPriceMap(
  fetchImpl: FetchLike = fetch,
): Promise<Map<number, GwPriceMatch>> {
  const catalogue = await fetchGwCatalogue(fetchImpl);
  const bySku = new Map<string, GwCatalogueItem>();
  for (const item of catalogue) {
    if (item.normalizedSku) {
      const existing = bySku.get(item.normalizedSku);
      // prefer entries that actually have a price
      if (!existing || (existing.price == null && item.price != null)) {
        bySku.set(item.normalizedSku, item);
      }
    }
  }

  const catalogueRecords = await loadSkuCatalogue();
  const map = new Map<number, GwPriceMatch>();
  for (const entry of catalogueRecords) {
    const productId = Number(entry.productId);
    if (!Number.isFinite(productId)) continue;
    const skus = [entry.canonicalSku, ...entry.skuAliases]
      .map((s) => normalizeShopifySku(s))
      .filter((s): s is string => Boolean(s));
    for (const sku of skus) {
      const item = bySku.get(sku);
      if (!item) continue;
      map.set(productId, {
        productId,
        price: item.price,
        url: item.slug ? `${SHOP_BASE}${item.slug}` : null,
        title: item.name ?? "",
        sku: item.sku,
      });
      break;
    }
  }
  return map;
}
