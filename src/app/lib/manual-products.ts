import path from "path";
import fs from "fs/promises";

export type ManualProductRecord = Record<string, unknown>;

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

export async function loadManualProductsSnapshot() {
  const { products, gameCategories } = await readManualProductsFile();
  return { products, gameCategories };
}
