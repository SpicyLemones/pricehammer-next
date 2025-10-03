import fs from "fs/promises";
import path from "path";

export type ManualProduct = {
  id: string;
  name: string;
  game?: "warhammer40k" | "ageofsigmar" | "universal" | string;
  faction?: string;
  category?: string;
  points?: number | null;
  image?: string;
  description?: string;
  retailers?: {
    store: string;
    price: number;
    inStock: boolean;
    url: string | null;
  }[];
};

const PRODUCTS_FILE = path.join(process.cwd(), "data/db/Product.ts");
const PRODUCTS_EXPORT = "export const Products";

function findProductsBounds(source: string) {
  const exportIdx = source.indexOf(PRODUCTS_EXPORT);
  if (exportIdx === -1) {
    throw new Error("Products export not found in Product.ts");
  }
  const arrayStart = source.indexOf("[", exportIdx);
  if (arrayStart === -1) {
    throw new Error("Products array start not found");
  }
  let depth = 0;
  let i = arrayStart;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        break;
      }
    }
  }
  if (depth !== 0) {
    throw new Error("Unbalanced brackets in Product.ts");
  }
  const arrayEnd = i + 1; // include closing bracket
  return { arrayStart, arrayEnd };
}

function parseProducts(source: string): ManualProduct[] {
  const { arrayStart, arrayEnd } = findProductsBounds(source);
  const arraySource = source.slice(arrayStart, arrayEnd);
  return JSON.parse(arraySource) as ManualProduct[];
}

function formatProducts(products: ManualProduct[]): string {
  if (products.length === 0) {
    return "[]";
  }
  const items = products
    .map((product) => JSON.stringify(product, null, 2))
    .map((block) => block.split("\n").map((line) => `  ${line}`).join("\n"))
    .join(",\n");
  return `[\n${items}\n]`;
}

export async function loadManualProducts(): Promise<ManualProduct[]> {
  const raw = await fs.readFile(PRODUCTS_FILE, "utf8");
  return parseProducts(raw);
}

export async function loadManualProduct(id: string): Promise<ManualProduct | undefined> {
  const products = await loadManualProducts();
  return products.find((p) => String(p.id) === String(id));
}

export async function saveManualProducts(products: ManualProduct[]): Promise<void> {
  const raw = await fs.readFile(PRODUCTS_FILE, "utf8");
  const { arrayStart, arrayEnd } = findProductsBounds(raw);
  const formatted = formatProducts(products);
  const updated = `${raw.slice(0, arrayStart)}${formatted}${raw.slice(arrayEnd)}`;
  await fs.writeFile(PRODUCTS_FILE, updated, "utf8");
}

export async function updateManualProduct(
  id: string,
  updates: Partial<Pick<ManualProduct, "name" | "game" | "faction" | "category" | "points">>,
): Promise<ManualProduct> {
  const raw = await fs.readFile(PRODUCTS_FILE, "utf8");
  const products = parseProducts(raw);
  const index = products.findIndex((p) => String(p.id) === String(id));
  if (index === -1) {
    throw new Error(`Product ${id} not found`);
  }

  const existing = products[index];
  const next: ManualProduct = { ...existing };

  if (updates.name !== undefined) {
    next.name = updates.name;
  }
  if (updates.game !== undefined) {
    next.game = updates.game;
  }
  if (updates.faction !== undefined) {
    next.faction = updates.faction;
  }
  if (updates.category !== undefined) {
    next.category = updates.category;
  }
  if (updates.points !== undefined) {
    next.points = updates.points;
  }

  products[index] = next;

  const { arrayStart, arrayEnd } = findProductsBounds(raw);
  const formatted = formatProducts(products);
  const updated = `${raw.slice(0, arrayStart)}${formatted}${raw.slice(arrayEnd)}`;
  await fs.writeFile(PRODUCTS_FILE, updated, "utf8");

  return next;
}
