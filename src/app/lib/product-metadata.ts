import { query } from "@/lib/sql";
import { Products as ProductSeeds } from "../../../data/db/Product";

export type ProductMetadata = {
  productId: number;
  baseName: string;
  metadataName: string | null;
  displayName: string;
  searchTerm: string;
  game: string | null;
  faction: string | null;
  category: string | null;
  points: number | null;
  hidden: boolean;
  image: string | null;
};

export type ProductMetadataInput = {
  name: string;
  game: string | null;
  faction: string | null;
  category: string | null;
  points: number | null;
  hidden: boolean;
  image: string | null;
};

type ProductWithMetadataRow = {
  product_id: number;
  product_name: string;
  search_term: string;
  metadata_name?: string | null;
  game?: string | null;
  faction?: string | null;
  category?: string | null;
  points?: number | null;
  hidden?: number | null;
  image?: string | null;
};

type SeedProduct = {
  id?: string | number;
  name?: string | null;
  game?: string | null;
  faction?: string | null;
  category?: string | null;
  points?: number | string | null;
  hidden?: boolean | null;
  image?: string | null;
};

let seedPromise: Promise<void> | null = null;

const toNullableString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toNullableNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "" && value !== "0" && value.toLowerCase() !== "false";
  return false;
};

const mapRowToMetadata = (row: ProductWithMetadataRow): ProductMetadata => {
  const id = Number(row.product_id);
  const baseName = toNullableString(row.product_name) ?? `Product ${id}`;
  const metadataName = toNullableString(row.metadata_name);
  const displayName = metadataName ?? baseName;

  return {
    productId: id,
    baseName,
    metadataName,
    displayName,
    searchTerm: toNullableString(row.search_term) ?? "",
    game: toNullableString(row.game),
    faction: toNullableString(row.faction),
    category: toNullableString(row.category),
    points: toNullableNumber(row.points),
    hidden: toBoolean(row.hidden),
    image: toNullableString(row.image),
  };
};

export async function ensureProductMetadataSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      await query("run", "create/product_metadata");

      const existingRows = (await query<{ product_id: number }[]>("all", "SELECT product_id FROM product_metadata")) ?? [];
      const existingIds = new Set<number>(existingRows.map((row) => Number(row.product_id)));

      const allProducts = (await query<{ id: number; name: string; search_term: string }[]>(
        "all",
        "select/all_products"
      )) ?? [];
      const productsById = new Map<number, { name: string; search_term: string }>(
        allProducts.map((p) => [Number(p.id), { name: p.name, search_term: p.search_term }])
      );

      const seeds: SeedProduct[] = Array.isArray(ProductSeeds) ? (ProductSeeds as SeedProduct[]) : [];
      if (!seeds.length) return;

      for (const seed of seeds) {
        const idNum = Number((seed?.id ?? "").toString());
        if (!Number.isFinite(idNum)) continue;
        if (!productsById.has(idNum)) continue;
        if (existingIds.has(idNum)) continue;

        const base = productsById.get(idNum)!;
        const seedName = toNullableString(seed?.name);
        const name = seedName ?? (toNullableString(base?.name) ?? `Product ${idNum}`);
        if (!name) continue;

        await query("run", "insert/product_metadata_seed", [
          idNum,
          name,
          toNullableString(seed?.game),
          toNullableString(seed?.faction),
          toNullableString(seed?.category),
          toNullableNumber(seed?.points),
          seed?.hidden === true ? 1 : 0,
          toNullableString(seed?.image),
        ]);
      }
    })().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }

  return seedPromise;
}

export async function fetchAllProductMetadata(): Promise<ProductMetadata[]> {
  await ensureProductMetadataSeeded();
  const rows = (await query<ProductWithMetadataRow[]>("all", "select/products_with_metadata")) ?? [];
  return rows.map(mapRowToMetadata);
}

export async function fetchProductMetadata(productId: number): Promise<ProductMetadata | null> {
  if (!Number.isFinite(productId)) return null;
  await ensureProductMetadataSeeded();
  const row = (await query<ProductWithMetadataRow | undefined>("get", "select/product_with_metadata", [productId])) ?? null;
  return row ? mapRowToMetadata(row) : null;
}

export async function upsertProductMetadata(
  productId: number,
  input: ProductMetadataInput
): Promise<ProductMetadata> {
  if (!Number.isFinite(productId)) {
    throw new Error("invalid-product-id");
  }

  const name = toNullableString(input.name) ?? "";
  if (!name) {
    throw new Error("name-required");
  }

  await ensureProductMetadataSeeded();

  await query("run", "update/product_metadata", [
    productId,
    name,
    toNullableString(input.game),
    toNullableString(input.faction),
    toNullableString(input.category),
    input.points,
    input.hidden ? 1 : 0,
    toNullableString(input.image),
  ]);

  const updated = await fetchProductMetadata(productId);
  if (!updated) {
    throw new Error("metadata-update-failed");
  }
  return updated;
}

export function normalizeString(value: unknown): string | null {
  return toNullableString(value);
}

export function normalizeNumber(value: unknown): number | null {
  return toNullableNumber(value);
}
