// src/app/lib/page-facts.ts
//
// Read a product page's SKU, price and title with a single plain HTTP GET:
// JSON-LD first (what the store tells search engines), then itemprop / meta
// fallbacks. Replaces the Puppeteer page-opener — product pages ship this
// data in the initial HTML, so a browser was never needed to read it.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type PageFacts = { sku: string | null; price: number | null; title: string | null };

const sane = (n: number | null) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0.5 && n <= 5000;

function num(v: unknown): number | null {
  if (v == null) return null;
  const m = String(v).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? decode(m[1]) : null;
}

export function extractPageFacts(html: string): PageFacts {
  let sku: string | null = null;
  let price: number | null = null;

  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const r = n as Record<string, unknown>;
    if (!sku && typeof r.sku === "string" && r.sku.trim()) sku = r.sku.trim();
    if (price == null && r.offers) {
      for (const o of (Array.isArray(r.offers) ? r.offers : [r.offers]) as Record<string, unknown>[]) {
        const v = num(o?.price ?? (o?.priceSpecification as Record<string, unknown> | undefined)?.price);
        if (sane(v)) {
          price = v;
          break;
        }
      }
    }
    for (const v of Object.values(r)) walk(v);
  };

  const ld = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ld.exec(html)) && !(sku && price != null)) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {
      // malformed JSON-LD chunk; keep looking
    }
  }

  if (!sku) {
    sku =
      attr(html, /data-product-sku=["']([^"']+)["']/i) ??
      attr(html, /itemprop=["']sku["'][^>]*content=["']([^"']+)["']/i) ??
      attr(html, /itemprop=["']sku["'][^>]*>([^<]+)</i);
  }
  if (price == null) {
    const v = num(
      attr(html, /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i) ??
        attr(html, /property=["'](?:og|product):price:amount["'][^>]*content=["']([^"']+)["']/i),
    );
    if (sane(v)) price = v;
  }

  const title =
    attr(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
    attr(html, /property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ??
    attr(html, /<title[^>]*>([\s\S]*?)<\/title>/i);

  return { sku, price, title: title || null };
}

export async function fetchPageFacts(url: string, timeoutMs = 15_000): Promise<PageFacts> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-AU,en;q=0.9" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return { sku: null, price: null, title: null };
    return extractPageFacts(await res.text());
  } catch {
    return { sku: null, price: null, title: null };
  }
}
