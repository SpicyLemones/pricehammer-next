// src/app/lib/shopify.ts
// Helpers for working with Shopify's public product feeds.

export type ShopifyFeedVariant = {
  id: number | string;
  title: string;
  sku: string | null;
  normalizedSku: string | null;
  price: number | null;
  compareAtPrice: number | null;
  available: boolean;
  barcode?: string | null;
};

export type ShopifyFeedProduct = {
  id: number | string;
  handle: string;
  title: string;
  status?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  updatedAt?: string;
  variants: ShopifyFeedVariant[];
};

export type ShopifyFeedSuccess = {
  ok: true;
  source: "rest_products_json";
  products: ShopifyFeedProduct[];
  pageCount: number;
  requestCount: number;
};

export type ShopifyFeedFailure = {
  ok: false;
  error: string;
  status?: number;
};

export type ShopifyFeedResult = ShopifyFeedSuccess | ShopifyFeedFailure;

type FetchLike = typeof fetch;

const DEFAULT_MAX_PAGES = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeShopifySku(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hyphenTail = trimmed.split("-").pop();
  if (hyphenTail && /^\d{5,}$/.test(hyphenTail)) return hyphenTail;

  const matches = trimmed.match(/\d{5,}/g);
  if (matches && matches.length > 0) {
    return matches[matches.length - 1];
  }

  return trimmed;
}

export async function fetchShopifyProductFeed(
  baseUrl: string,
  opts: { fetchImpl?: FetchLike; maxPages?: number } = {}
): Promise<ShopifyFeedResult> {
  let origin: URL;
  try {
    origin = new URL(baseUrl);
  } catch {
    return { ok: false, error: `Invalid Shopify base URL: ${baseUrl}` };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxPages = Math.max(1, opts.maxPages ?? DEFAULT_MAX_PAGES);

  const products: ShopifyFeedProduct[] = [];
  let pageCount = 0;
  let requestCount = 0;
  let sinceId: number | null = null;

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL("/products.json", origin);
    url.searchParams.set("limit", "250");
    if (sinceId != null) url.searchParams.set("since_id", String(sinceId));
    else url.searchParams.set("page", String(page));

    let res: Response;
    try {
      res = await fetchImpl(url.toString(), {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } catch (error) {
      const message = (error as Error)?.message || String(error);
      return {
        ok: false,
        error: `Failed to fetch Shopify feed (${message})`,
      };
    }
    requestCount++;

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Shopify returned ${res.status} ${res.statusText || ""}`.trim(),
      };
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (error) {
      return {
        ok: false,
        error: `Failed to parse Shopify JSON feed (${(error as Error)?.message || error})`,
      };
    }

    const feedProducts: Record<string, unknown>[] | undefined =
      isRecord(data) && Array.isArray(data.products)
        ? (data.products as unknown[]).filter(isRecord)
        : undefined;

    if (!feedProducts) {
      return {
        ok: false,
        error: "Unexpected Shopify feed response (missing products array)",
      };
    }

    if (feedProducts.length === 0) {
      break;
    }

    for (const prod of feedProducts) {
      const rawVariants = isRecord(prod) && Array.isArray(prod.variants)
        ? (prod.variants as unknown[]).filter(isRecord)
        : [];

      const variants: ShopifyFeedVariant[] = rawVariants.map((variant) => {
        const sku = typeof variant.sku === "string" ? variant.sku : null;
        const availableValue =
          typeof variant.available === "boolean"
            ? variant.available
            : typeof variant["available_for_sale"] === "boolean"
              ? (variant["available_for_sale"] as boolean)
              : null;

        return {
          id:
            typeof variant.id === "number" || typeof variant.id === "string"
              ? variant.id
              : "",
          title: typeof variant.title === "string" ? variant.title : "",
          sku,
          normalizedSku: normalizeShopifySku(sku),
          price: coerceNumber(variant.price),
          compareAtPrice: coerceNumber(variant.compare_at_price),
          available:
            availableValue != null
              ? availableValue
              : Boolean(
                  typeof variant.available === "boolean"
                    ? variant.available
                    : variant["available_for_sale"]
                ),
          barcode: typeof variant.barcode === "string" ? variant.barcode : null,
        };
      });

      products.push({
        id:
          typeof prod.id === "number" || typeof prod.id === "string"
            ? prod.id
            : "",
        handle: typeof prod.handle === "string" ? prod.handle : "",
        title: typeof prod.title === "string" ? prod.title : "",
        status: typeof prod.status === "string" ? prod.status : undefined,
        vendor: typeof prod.vendor === "string" ? prod.vendor : undefined,
        productType:
          typeof prod["product_type"] === "string"
            ? (prod["product_type"] as string)
            : undefined,
        tags: Array.isArray(prod.tags)
          ? prod.tags.filter((t: unknown): t is string => typeof t === "string")
          : undefined,
        updatedAt:
          typeof prod["updated_at"] === "string"
            ? (prod["updated_at"] as string)
            : undefined,
        variants,
      });

      const idNum = coerceNumber(prod.id);
      if (idNum != null) sinceId = idNum;
    }

    pageCount++;

    if (feedProducts.length < 250) {
      break;
    }
  }

  return {
    ok: true,
    source: "rest_products_json",
    products,
    pageCount,
    requestCount,
  };
}
