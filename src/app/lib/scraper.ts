// src/app/lib/scraper.ts
// Server-only helpers for scraping. Import only from routes with `export const runtime = "nodejs"`.

import pLimit from "p-limit";

/* ---------------- Types ---------------- */
export type Seller = {
  id?: number;
  name?: string;
  base_url: string;
  search_url: string;
  product_selector: string;
  name_selector?: string;
  link_selector?: string;
  price_selector?: string;
  sale_selector?: string;
  image_selector?: string;

  // Optional product page selectors:
  product_price_selector?: string;
  product_sale_selector?: string;
  product_image_selector?: string;
};

export type Product = {
  id?: number;
  name: string;
  search_term: string;
};

export type Candidate = {
  link: string | null;
  price: number | null;
  img: string | null; // IMAGE URL (not a Buffer)
};

type BrowserLike = {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
};
type PageLike = {
  setUserAgent(ua: string): Promise<void>;
  setExtraHTTPHeaders?(hdrs: Record<string, string>): Promise<void>;
  setViewport?(v: { width: number; height: number; deviceScaleFactor?: number }): Promise<void>;
  goto(url: string, opts: { waitUntil: any; timeout: number }): Promise<any>;
  waitForSelector(sel: string, opts?: { timeout?: number }): Promise<void>;
  evaluate<T = any>(fn: any, arg?: any): Promise<T>;
  $$eval<T, A = unknown>(selector: string, fn: (els: Element[], args: A) => T, args: A): Promise<T>;
  close(): Promise<void>;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/* ---- price sanity (AUD-ish) ---- */
const MIN_PRICE = 0.5;
const MAX_PRICE = 5000;
const isSanePrice = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) && n >= MIN_PRICE && n <= MAX_PRICE;

/* ---------------- Single shared Puppeteer instance ---------------- */
let _browserPromise: Promise<BrowserLike> | null = null;
async function getBrowser(): Promise<BrowserLike> {
  if (!_browserPromise) _browserPromise = launchPuppeteer();
  try {
    return await _browserPromise;
  } catch (e) {
    _browserPromise = null;
    throw e;
  }
}

async function launchPuppeteer(): Promise<BrowserLike> {
  const puppeteer = (await import("puppeteer")).default as any;

  const args = ["--no-sandbox", "--disable-setuid-sandbox"];
  const proxy = process.env.PUPPETEER_PROXY;
  if (proxy) args.push(`--proxy-server=${proxy}`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // optional
    args,
  });
  return browser as unknown as BrowserLike;
}

/* ---------------- Utils ---------------- */
function pickNumber(txt?: string | null): number | null {
  if (!txt) return null;
  const m = txt.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function firstFromSrcset(srcset?: string | null): string | null {
  if (!srcset) return null;
  const first = srcset.split(",")[0]?.trim().split(" ")[0];
  return first || null;
}
function toAbs(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/* ---------------- Tiny in-memory cache ---------------- */
type CacheEntry = { ts: number; items: Candidate[] };
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 1000 * 60 * 5; // 5 minutes

export function cacheKey(sellerId?: number, productId?: number, term?: string) {
  return `${sellerId || 0}:${productId || 0}:${(term || "").trim().toLowerCase()}`;
}
export function cacheGet(key: string): Candidate[] | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.items;
}
export function cacheSet(key: string, items: Candidate[]) {
  CACHE.set(key, { ts: Date.now(), items });
}

/* -------------------------------------------------------
   Product-page price fetch (same logic as before)
-------------------------------------------------------- */
export async function fetchPriceFromLinkWithSellerSelectors(
  seller: {
    product_price_selector?: string;
    product_sale_selector?: string;
    price_selector?: string;
    sale_selector?: string;
  },
  link: string
): Promise<number | null> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders?.({ "accept-language": "en-AU,en;q=0.9" });
    await page.setViewport?.({ width: 1280, height: 900, deviceScaleFactor: 1 });

    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 15_000 });

    // small settle
    await page.evaluate(() => new Promise((r) => setTimeout(r, 250 + Math.random() * 250)));

    const price = await page.evaluate((sel: any) => {
      const parseNum = (t?: string | null) => {
        if (!t) return null;
        const m = t.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
        return m ? parseFloat(m[0]) : null;
      };
      const by = (css?: string | null) =>
        css ? parseNum(document.querySelector(css)?.textContent ?? "") : null;

      const sane = (n: number | null) =>
        typeof n === "number" && Number.isFinite(n) && n >= 0.5 && n <= 5000;

      // Strictly extract text from an element while excluding <option> values and requiring $/AUD somewhere
      const extractCurrencyFromEl = (root: Element | null): number | null => {
        if (!root) return null;

        // clone & strip selects/options to be safe
        const clone = root.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("select, option").forEach((el) => el.remove());

        const text = clone.innerText || "";
        const s = text.replace(/\s+/g, " ").trim();

        // require a currency hint
        if (!/\$|aud/i.test(s)) return null;

        const m = s.replace(/,/g, "").match(/(?:\$|aud)\s*(-?\d+(?:\.\d+)?)/i);
        if (m) {
          const v = parseFloat(m[1]);
          return sane(v) ? v : null;
        }
        return null;
      };

      // 1) Prefer explicit product-page selectors
      const sale = by(sel.product_sale_selector);
      if (sane(sale)) return sale!;
      const reg = by(sel.product_price_selector);
      if (sane(reg)) return reg!;

      // 2) Listing selectors
      const sale2 = by(sel.sale_selector);
      if (sane(sale2)) return sale2!;
      const reg2 = by(sel.price_selector);
      if (sane(reg2)) return reg2!;

      // 3) itemprop=price
      const itemProp =
        document.querySelector("[itemprop='price']")?.getAttribute?.("content") ||
        document.querySelector("[itemprop='price']")?.textContent ||
        "";
      const itemNum = parseNum(itemProp);
      if (sane(itemNum)) return itemNum!;

      // 4) common price classes requiring currency nearby
      const COMMON = [
        ".price--withTax",
        ".price--main",
        ".productView-price",
        ".productView-price-value",
        ".product__price",
        ".product-price",
        ".price",
        ".price__value",
        ".price-item",
        ".money",
      ];
      for (const c of COMMON) {
        const el = document.querySelector(c);
        if (!el) continue;

        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("select, option").forEach((x) => x.remove());
        const s = (clone.innerText || "").replace(/\s+/g, " ").trim();
        if (!/\$|aud/i.test(s)) continue;

        const mm = s.replace(/,/g, "").match(/(?:\$|aud)\s*(-?\d+(?:\.\d+)?)/i);
        if (mm) {
          const v = parseFloat(mm[1]);
          if (sane(v)) return v!;
        }
      }

      // 5) Meta / JSON-LD
      const og = document.querySelector("meta[property='og:price:amount']")?.getAttribute("content");
      const ogNum = parseNum(og || "");
      if (sane(ogNum)) return ogNum!;

      try {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        for (const s of scripts) {
          try {
            const data = JSON.parse(s.textContent || "null");
            const arr = Array.isArray(data) ? data : [data];
            for (const d of arr) {
              const offers = d?.offers;
              const raw =
                (Array.isArray(offers) ? offers[0]?.price : offers?.price) ??
                (Array.isArray(offers) ? offers[0]?.priceSpecification?.price : offers?.priceSpecification?.price);
              const v2 = parseNum(raw != null ? String(raw) : "");
              if (sane(v2)) return v2!;
            }
          } catch {}
        }
      } catch {}

      return null;
    }, {
      product_price_selector: seller.product_price_selector || null,
      product_sale_selector: seller.product_sale_selector || null,
      price_selector: seller.price_selector || null,
      sale_selector: seller.sale_selector || null,
    });

    if (!isSanePrice(price)) return null;
    return price;
  } catch {
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

/* ------------------------------------------------
   Search a seller for candidates (link, price, img URL)
   NOTE: No server-side image downloads anymore.
-------------------------------------------------- */
export async function searchSeller(
  seller: Seller,
  product: Product
): Promise<Candidate[]> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders?.({ "accept-language": "en-AU,en;q=0.9" });
    await page.setViewport?.({ width: 1280, height: 900, deviceScaleFactor: 1 });

    // best-effort resource blocking (still useful)
    try {
      const anyPage = page as any;
      await anyPage.setRequestInterception?.(true);
      anyPage.on?.("request", (req: any) => {
        const type = req.resourceType?.() || "";
        const url = req.url?.() || "";
        if (
          type === "media" ||
          type === "font" ||
          /doubleclick|google-analytics|facebook\.com|hotjar|gtag\./i.test(url)
        ) {
          return req.abort();
        }
        return req.continue();
      });
    } catch {}

    const searchUrl = seller.base_url + seller.search_url.replace(/\*/g, encodeURIComponent(product.search_term));

    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    } catch {}

    // lazy lists / infinite scroll
    try {
      await page.evaluate(async () => {
        const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
        let last = 0;
        for (let i = 0; i < 4; i++) {
          window.scrollTo(0, document.body.scrollHeight);
          await delay(250 + Math.random() * 200);
          const h = document.body.scrollHeight;
          if (h === last) break;
          last = h;
        }
        window.scrollTo(0, 0);
      });
    } catch {}

    if (seller.product_selector) {
      try {
        await page.waitForSelector(seller.product_selector, { timeout: 6_000 });
      } catch {}
    }

    type EvalArgs = {
      base_url: string;
      name?: string;
      link?: string;
      img?: string;
      price?: string;
      sale?: string;
    };

    const cards = await page.$$eval<
      Candidate[],
      EvalArgs
    >(
      seller.product_selector,
      (nodes: Element[], sel: EvalArgs) => {
        const firstFromSrcset = (srcset?: string | null) => {
          if (!srcset) return null;
          const first = srcset.split(",")[0]?.trim().split(" ")[0];
          return first || null;
        };
        const pickNum = (txt?: string | null) => {
          if (!txt) return null;
          const m = txt.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
          return m ? parseFloat(m[0]) : null;
        };
        const toAbs = (href: string | null | undefined, base: string) => {
          if (!href) return null;
          try { return new URL(href, base).toString(); } catch { return href; }
        };

        return nodes
          .map((el) => {
            // Link
            let linkEl =
              (sel.link && (el.querySelector(sel.link) as HTMLAnchorElement | null)) ||
              (el.querySelector("a") as HTMLAnchorElement | null);
            const link = linkEl ? toAbs(linkEl.getAttribute("href") || linkEl.href, sel.base_url) : null;

            // Image URL
            let imgEl =
              (sel.img && (el.querySelector(sel.img) as HTMLElement | null)) ||
              (el.querySelector("img") as HTMLImageElement | null);
            if (imgEl && imgEl.tagName.toLowerCase() !== "img") {
              const inner = imgEl.querySelector("img");
              if (inner) imgEl = inner as any;
            }
            const src =
              (imgEl?.getAttribute?.("src") as string | null) ||
              (imgEl?.getAttribute?.("data-src") as string | null) ||
              firstFromSrcset(imgEl?.getAttribute?.("srcset")) ||
              firstFromSrcset(imgEl?.getAttribute?.("data-srcset")) ||
              null;
            const imgLink = toAbs(src, sel.base_url);

            // Price
            const saleText  = sel.sale  ? (el.querySelector(sel.sale)?.textContent  ?? "") : "";
            const priceText = sel.price ? (el.querySelector(sel.price)?.textContent ?? "") : "";
            const itemPropText =
              (el.querySelector("[itemprop='price']") as HTMLElement | null)?.getAttribute?.("content") ||
              (el.querySelector("[itemprop='price']")?.textContent ?? "") ||
              "";
            const anyPriceText = el.querySelector(".price")?.textContent ?? "";

            const price =
              pickNum(saleText) ??
              pickNum(priceText) ??
              pickNum(itemPropText) ??
              pickNum(anyPriceText) ??
              null;

            return { link, price, img: imgLink };
          })
          .filter((r) => !!r.link);
      },
      {
        base_url: seller.base_url,
        name: seller.name_selector,
        link: seller.link_selector,
        img: seller.image_selector,
        price: seller.price_selector,
        sale: seller.sale_selector,
      }
    );

    // No server-side image downloads anymore.
    return cards;
  } finally {
    await page.close().catch(() => {});
  }
}
