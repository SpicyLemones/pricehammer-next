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
  image: string | null;
  imageAlt?: string | null;
  productUrl?: string | null;
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

// Real-world feeds run deep: The Combat Company ~12.5k products, Gap Games and
// Gumnut ~20k. 80 pages x 250 = 20k coverage; loop still exits early on a short page.
const DEFAULT_MAX_PAGES = 80;

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

function pickImage(record: Record<string, unknown>): {
  src: string | null;
  alt: string | null;
} {
  const direct = isRecord(record.image) ? (record.image as Record<string, unknown>) : null;
  if (direct) {
    const src = typeof direct.src === "string" ? direct.src : null;
    const alt = typeof direct.alt === "string" ? direct.alt : null;
    if (src) return { src, alt };
  }

  if (Array.isArray(record.images)) {
    for (const entry of record.images as unknown[]) {
      if (!isRecord(entry)) continue;
      const src = typeof entry.src === "string" ? entry.src : null;
      if (src) {
        return {
          src,
          alt: typeof entry.alt === "string" ? (entry.alt as string) : null,
        };
      }
    }
  }

  return { src: null, alt: null };
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

  // Plain page-based pagination. Mixing page= (first request, default order)
  // with since_id= (subsequent requests, id order) anchors the walk at the
  // wrong id and silently skips large chunks of the feed.
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL("/products.json", origin);
    url.searchParams.set("limit", "250");
    url.searchParams.set("page", String(page));

    // small spacing between pages keeps us under Shopify's public rate limit
    if (page > 1) await new Promise((r) => setTimeout(r, 350));

    let res: Response | null = null;
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetchImpl(url.toString(), {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
      } catch (error) {
        lastError = (error as Error)?.message || String(error);
        res = null;
        break; // network failure — retrying rarely helps mid-run
      }
      requestCount++;
      if (res.status !== 429) break;
      // rate limited: honor Retry-After (or back off progressively) and retry
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 3000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    if (!res) {
      return {
        ok: false,
        error: `Failed to fetch Shopify feed (${lastError ?? "unknown error"})`,
      };
    }

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
      const { src: imageSrc, alt: imageAlt } = pickImage(prod);
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
        image: imageSrc,
        imageAlt: imageAlt ?? undefined,
      });
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
