// src/app/lib/sku-catalogue.ts
//
// DB-backed canonical SKU catalogue. The product_skus table is the source of
// truth (synced from GW's own catalogue via /api/admin/sync-gw-catalogue);
// the generated data/db/product-skus.ts file remains only as a fallback for
// databases that predate the table.

import { query } from "@/lib/sql";
import { ProductSkuCatalogue } from "../../../data/db/product-skus";

export type SkuCatalogueRecord = {
  productId: string;
  name: string;
  canonicalSku: string | null;
  skuAliases: string[];
  nameAliases: string[];
  image: string | null;
};

type DbRow = {
  product_id: number;
  canonical_sku: string | null;
  sku_aliases: string | null;
  name_aliases: string | null;
  name: string | null;
  image: string | null;
};

function parseJsonList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let _cache: { ts: number; records: SkuCatalogueRecord[] } | null = null;

export function invalidateSkuCatalogueCache(): void {
  _cache = null;
}

export async function loadSkuCatalogue(): Promise<SkuCatalogueRecord[]> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache.records;

  let records: SkuCatalogueRecord[] = [];
  try {
    const rows = (await query(
      "all",
      `SELECT ps.product_id, ps.canonical_sku, ps.sku_aliases, ps.name_aliases,
              p.name, pm.image
       FROM product_skus ps
       LEFT JOIN products p ON p.id = ps.product_id
       LEFT JOIN product_metadata pm ON pm.product_id = ps.product_id`,
    )) as DbRow[];
    records = rows.map((r) => ({
      productId: String(r.product_id),
      name: r.name ?? "",
      canonicalSku: r.canonical_sku,
      skuAliases: parseJsonList(r.sku_aliases),
      nameAliases: parseJsonList(r.name_aliases),
      image: r.image ?? null,
    }));
  } catch {
    // table missing (pre-migration DB) — fall through to the static file
  }

  if (!records.length) {
    records = ProductSkuCatalogue.map((entry) => ({
      productId: entry.productId,
      name: entry.nameAliases?.[0] ?? "",
      canonicalSku: entry.canonicalSku,
      skuAliases: entry.skuAliases ?? [],
      nameAliases: entry.nameAliases ?? [],
      image: null,
    }));
  }

  _cache = { ts: Date.now(), records };
  return records;
}
