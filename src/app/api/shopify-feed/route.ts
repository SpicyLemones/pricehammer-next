import { NextResponse } from "next/server";

import {
  fetchShopifyProductFeed,
  normalizeShopifySku,
  type ShopifyFeedResult,
} from "@/app/lib/shopify";
import { matchShopifyProductsAgainstCatalogue } from "@/app/lib/shopify-catalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  baseUrl?: string;
  maxPages?: number;
  includeMatches?: boolean;
};

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const intParsed = Math.floor(parsed);
  return intParsed >= 1 ? intParsed : null;
}

function buildFallbackResponse(result: Extract<ShopifyFeedResult, { ok: false }>) {
  const fallbackMessage =
    "Shopify did not return a product feed. Would you like to fall back to " +
    "verifying each search result by reading the SKU from the product page " +
    "(using the trailing manufacturer code, e.g. 99120218061, from any " +
    "embedded JSON-LD)?";

  return NextResponse.json(
    {
      ok: false,
      error: result.error,
      status: result.status,
      fallback: {
        suggestion: fallbackMessage,
        skuExample: {
          raw: "prod4780167-99120218061",
          normalized: normalizeShopifySku("prod4780167-99120218061"),
        },
      },
    },
    { status: result.status && result.status >= 400 ? result.status : 502 }
  );
}

function respondWithResult(
  result: ShopifyFeedResult,
  extras?: Record<string, unknown>,
) {
  if (result.ok) {
    return NextResponse.json(
      {
        ...result,
        ...(extras ?? {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return buildFallbackResponse(result);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const baseUrl = url.searchParams.get("baseUrl");
  const maxPagesParam = url.searchParams.get("maxPages");
  const includeMatchesParam =
    url.searchParams.get("includeMatches") ?? url.searchParams.get("match");

  if (!baseUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing baseUrl query parameter. Example: /api/shopify-feed?baseUrl=https://example.myshopify.com",
        usage: {
          method: "POST",
          endpoint: "/api/shopify-feed",
          body: { baseUrl: "https://example.myshopify.com", maxPages: 3 },
        },
      },
      { status: 400 }
    );
  }

  const maxPages = parsePositiveInt(maxPagesParam);
  if (maxPagesParam && maxPages == null) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid maxPages value: ${maxPagesParam}. Provide a positive integer.`,
      },
      { status: 400 }
    );
  }

  const result = await fetchShopifyProductFeed(baseUrl, {
    maxPages: maxPages ?? undefined,
  });

  if (!result.ok) {
    return respondWithResult(result);
  }

  const includeMatches =
    typeof includeMatchesParam === "string" &&
    ["1", "true", "yes", "on"].includes(includeMatchesParam.toLowerCase());

  const extras = includeMatches
    ? {
        matchSummary: await matchShopifyProductsAgainstCatalogue(result.products, {
          baseUrl,
        }),
      }
    : undefined;

  return respondWithResult(result, extras);
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid JSON payload: ${(error as Error)?.message || error}`,
      },
      { status: 400 }
    );
  }

  if (!body?.baseUrl) {
    return NextResponse.json(
      { ok: false, error: "Missing baseUrl in request body" },
      { status: 400 }
    );
  }

  const result = await fetchShopifyProductFeed(body.baseUrl, {
    maxPages: body.maxPages,
  });

  if (!result.ok) {
    return respondWithResult(result);
  }

  const includeMatches = Boolean(body?.includeMatches);
  const extras = includeMatches
    ? {
        matchSummary: await matchShopifyProductsAgainstCatalogue(result.products, {
          baseUrl: body.baseUrl,
        }),
      }
    : undefined;

  return respondWithResult(result, extras);
}
