import path from "path";
import fs from "fs/promises";

import { query } from "./sql";

export type ManualProductRecord = Record<string, unknown>;

type ManualProductOverrideRow = {
  product_id: number;
  name: string | null;
  game: string | null;
  faction: string | null;
  category: string | null;
  points: number | null;
  hidden: number | null;
};

type ManualProductOverride = {
  id: string;
  name?: string;
  game?: string | null;
  faction?: string | null;
  category?: string | null;
  points?: number | null;
  hidden?: boolean | null;
};

export type ManualProductsFile = {
  filePath: string;
  before: string;
  after: string;
  products: ManualProductRecord[];
  gameCategories: Record<string, string[]>;
};

const PRODUCTS_MARKER = "export const Products: Product[] =";
const GAME_CATEGORIES_MARKER = "export const gameCategories =";

function extractProducts(source: string) {
  const markerIndex = source.indexOf(PRODUCTS_MARKER);
  if (markerIndex === -1) {
    throw new Error("Unable to locate Products array in Product.ts");
  }

  const arrayStart = source.indexOf("[", markerIndex + PRODUCTS_MARKER.length);
  const arrayEnd = source.indexOf("];", arrayStart);
  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error("Unable to parse Products array");
  }

  const before = source.slice(0, arrayStart);
  const after = source.slice(arrayEnd + 2);
  const arrayContent = source.slice(arrayStart, arrayEnd + 1);
  const parsed = JSON.parse(arrayContent) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Manual products data is not an array");
  }

  return {
    before,
    after,
    products: parsed as ManualProductRecord[],
  };
}

function stripComments(input: string) {
  return input.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
}

function extractGameCategories(source: string) {
  const markerIndex = source.indexOf(GAME_CATEGORIES_MARKER);
  if (markerIndex === -1) {
    return {};
  }

  const braceStart = source.indexOf("{", markerIndex + GAME_CATEGORIES_MARKER.length);
  if (braceStart === -1) {
    return {};
  }

  let depth = 0;
  let endIndex = -1;
  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex === -1) {
    return {};
  }

  const rawObject = source.slice(braceStart, endIndex + 1);
  const withoutComments = stripComments(rawObject);
  const normalizedKeys = withoutComments.replace(/(\s*)([A-Za-z0-9_]+)\s*:/g, (match, whitespace, key) => {
    return `${whitespace}"${key}":`;
  });
  const normalizedQuotes = normalizedKeys.replace(/'/g, '"');

  try {
    const parsed = JSON.parse(normalizedQuotes) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const entries = Object.entries(parsed).map(([gameKey, categories]) => [
      String(gameKey),
      Array.isArray(categories) ? categories.map((entry) => String(entry)) : [],
    ]);
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function formatProductsArray(products: ManualProductRecord[]) {
  const json = JSON.stringify(products, null, 2);
  return json.replace(/\n\]$/, "\n];");
}

export async function readManualProductsFile(): Promise<ManualProductsFile> {
  const filePath = path.join(process.cwd(), "data/db/Product.ts");
  const source = await fs.readFile(filePath, "utf8");
  const { before, after, products } = extractProducts(source);
  const gameCategories = extractGameCategories(source);

  return { filePath, before, after, products, gameCategories };
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePoints(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

async function hydrateOverridesFromFileIfEmpty() {
  const countRow = (await query<{ count?: number }>("get", "select/manual_product_overrides_count")) || { count: 0 };
  const count = Number(countRow?.count ?? 0);
  if (Number.isFinite(count) && count > 0) {
    return;
  }

  const { products } = await readManualProductsFile();
  for (const product of products) {
    const rawId = (product as ManualProductRecord).id;
    const idNum = Number(typeof rawId === "string" ? rawId : (rawId as number));
    if (!Number.isFinite(idNum)) continue;

    const name = normalizeString((product as ManualProductRecord).name);
    if (!name) continue;

    const game = normalizeString((product as ManualProductRecord).game);
    const faction = normalizeString((product as ManualProductRecord).faction);
    const category = normalizeString((product as ManualProductRecord).category);
    const points = normalizePoints((product as ManualProductRecord).points);
    const hiddenValue = (product as ManualProductRecord).hidden === true ? 1 : null;

    await query("run", "update/upsert_manual_product_override", [
      idNum,
      name,
      game,
      faction,
      category,
      typeof points === "number" && Number.isFinite(points) ? points : null,
      hiddenValue,
    ]);
  }
}

let overridesReady: Promise<void> | null = null;
async function ensureOverridesReady() {
  if (!overridesReady) {
    overridesReady = (async () => {
      await query("run", "create/manual_product_overrides");
      await hydrateOverridesFromFileIfEmpty();
    })();
  }

  await overridesReady;
}

function rowToOverride(row: ManualProductOverrideRow): ManualProductOverride {
  const override: ManualProductOverride = { id: String(row.product_id) };

  if (typeof row.name === "string" && row.name.trim()) {
    override.name = row.name.trim();
  }

  if (row.game !== undefined) {
    override.game = row.game === null ? null : normalizeString(row.game);
  }

  if (row.faction !== undefined) {
    override.faction = row.faction === null ? null : normalizeString(row.faction);
  }

  if (row.category !== undefined) {
    override.category = row.category === null ? null : normalizeString(row.category);
  }

  if (row.points !== undefined) {
    override.points = row.points === null ? null : Number(row.points);
  }

  if (row.hidden !== undefined) {
    override.hidden = row.hidden === null ? null : Number(row.hidden) === 1;
  }

  return override;
}

async function loadOverridesMap() {
  await ensureOverridesReady();
  const rows = (await query<ManualProductOverrideRow[]>("all", "select/manual_product_overrides")) ?? [];
  const map = new Map<string, ManualProductOverride>();
  for (const row of rows) {
    map.set(String(row.product_id), rowToOverride(row));
  }
  return map;
}

function applyOverride(base: ManualProductRecord, override: ManualProductOverride) {
  const next: ManualProductRecord = { ...base };

  if (override.name) {
    next.name = override.name;
  }

  if (Object.prototype.hasOwnProperty.call(override, "game")) {
    if (override.game === null) {
      delete next.game;
    } else if (typeof override.game === "string") {
      next.game = override.game;
    }
  }

  if (Object.prototype.hasOwnProperty.call(override, "faction")) {
    if (override.faction === null) {
      delete next.faction;
    } else if (typeof override.faction === "string") {
      next.faction = override.faction;
    }
  }

  if (Object.prototype.hasOwnProperty.call(override, "category")) {
    if (override.category === null) {
      delete next.category;
    } else if (typeof override.category === "string") {
      next.category = override.category;
    }
  }

  if (Object.prototype.hasOwnProperty.call(override, "points")) {
    if (override.points === null || override.points === undefined) {
      delete next.points;
    } else {
      next.points = override.points;
    }
  }

  if (Object.prototype.hasOwnProperty.call(override, "hidden")) {
    if (override.hidden === null) {
      delete next.hidden;
    } else {
      next.hidden = override.hidden;
    }
  }

  return next;
}

async function buildFallbackRecords(overrides: Map<string, ManualProductOverride>, baseIds: Set<string>) {
  const missing = Array.from(overrides.keys()).filter((id) => !baseIds.has(id));
  if (missing.length === 0) return new Map<string, ManualProductRecord>();

  const numericIds = missing
    .map((id) => Number(id))
    .filter((value) => Number.isFinite(value));

  const placeholders = numericIds.map(() => "?").join(", ");
  type ProductRow = { id: number; name: string };

  const rows = placeholders
    ? await query<ProductRow[]>(
        "all",
        `SELECT id, name FROM products WHERE id IN (${placeholders})`,
        numericIds,
      )
    : [];

  const fallbackMap = new Map<string, ManualProductRecord>();
  for (const row of rows ?? []) {
    if (!row) continue;
    fallbackMap.set(String(row.id), { id: String(row.id), name: row.name });
  }
  return fallbackMap;
}

export async function loadManualProductsSnapshot() {
  const { products: fileProducts, gameCategories } = await readManualProductsFile();
  const overrides = await loadOverridesMap();

  const baseIds = new Set<string>();
  for (const product of fileProducts) {
    const id = String((product as ManualProductRecord).id ?? "");
    if (!id) continue;
    baseIds.add(id);
  }

  const fallbackMap = await buildFallbackRecords(overrides, baseIds);

  const merged: ManualProductRecord[] = [];
  const seen = new Set<string>();

  for (const product of fileProducts) {
    const id = String((product as ManualProductRecord).id ?? "");
    if (!id) continue;
    const override = overrides.get(id);
    const next = override ? applyOverride(product, override) : product;
    merged.push(next);
    seen.add(id);
  }

  for (const [id, override] of overrides.entries()) {
    if (seen.has(id)) continue;
    const fallback = fallbackMap.get(id) ?? { id };
    merged.push(applyOverride(fallback, override));
  }

  return { products: merged, gameCategories };
}

export async function loadManualProductById(id: string) {
  const snapshot = await loadManualProductsSnapshot();
  const entry = snapshot.products.find((item) => String(item.id) === String(id));
  if (entry) {
    return { ...entry } as ManualProductRecord;
  }

  const row = await query<{ id: number; name: string } | undefined>(
    "get",
    "select/product_id",
    [Number(id)],
  );

  if (row && row.id) {
    return { id: String(row.id), name: row.name } as ManualProductRecord;
  }

  return null;
}

export async function saveManualProductOverride(id: string, record: ManualProductRecord) {
  await ensureOverridesReady();

  const idNum = Number(id);
  if (!Number.isFinite(idNum)) {
    throw new Error("invalid-id");
  }

  const name = normalizeString(record.name);
  if (!name) {
    throw new Error("invalid-name");
  }

  const game = normalizeString(record.game);
  const faction = normalizeString(record.faction);
  const category = normalizeString(record.category);
  const points = normalizePoints(record.points);
  const hidden = record.hidden === true ? 1 : record.hidden === false ? 0 : null;

  await query("run", "update/upsert_manual_product_override", [
    idNum,
    name,
    game,
    faction,
    category,
    Number.isFinite(points) ? points : null,
    hidden,
  ]);

  return loadManualProductById(String(idNum));
}
