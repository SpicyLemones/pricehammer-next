import { NextResponse } from "next/server";

import {
  fetchShopifyProductFeed,
  normalizeShopifySku,
} from "@/app/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  baseUrl?: string;
  maxPages?: number;
};

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

  if (result.ok) {
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  }

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
