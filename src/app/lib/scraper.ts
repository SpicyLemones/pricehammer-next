// src/app/lib/scraper.ts
// Server-only helpers for scraping. Import only from routes with `export const runtime = "nodejs"`.

type Seller = {
  id?: number;
  name?: string;
  base_url: string;
  search_url: string;       // e.g. "/search?q=*"
  product_selector: string; // CSS list items
  name_selector?: string;
  link_selector?: string;
  price_selector?: string;
  sale_selector?: string;
  image_selector?: string;
};

type Product = {
  id?: number;
  name: string;
  search_term: string;
};

export type Candidate = {
  link: string | null;
  price: number | null;
  img: Buffer | null;
};

type BrowserLike = {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
};
type PageLike = {
  setUserAgent(ua: string): Promise<void>;
  goto(url: string, opts: { waitUntil: any; timeout: number }): Promise<any>;
  waitForSelector(sel: string, opts?: { timeout?: number }): Promise<void>;
  // allow 1 or 2 args like real Puppeteer
  evaluate<T = any>(fn: any, arg?: any): Promise<T>;
  $$eval<T, A = unknown>(
    selector: string,
    fn: (els: Element[], args: A) => T,
    args: A
  ): Promise<T>;
  close(): Promise<void>;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function launchPuppeteer(): Promise<BrowserLike> {
  try {
    // Try puppeteer-extra + stealth
    const puppeteerExtra = (await import("puppeteer-extra")).default as any;
    const Stealth = (await import("puppeteer-extra-plugin-stealth")).default as any;
    const plugin = typeof Stealth === "function" ? Stealth() : Stealth?.default?.() ?? Stealth;
    if (typeof puppeteerExtra.use === "function") puppeteerExtra.use(plugin);
    const browser = await puppeteerExtra.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    return browser as unknown as BrowserLike;
  } catch {
    // Fallback to plain puppeteer
    const puppeteer = (await import("puppeteer")).default as any;
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    return browser as unknown as BrowserLike;
  }
}

/** Extracts a number from a price-like string. */
function pickNumber(txt?: string | null): number | null {
  if (!txt) return null;
  const m = txt.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/**
 * Refresh a product page by seller selectors and return the best price found.
 */
export async function fetchPriceFromLinkWithSellerSelectors(
  seller: { price_selector?: string; sale_selector?: string },
  link: string
): Promise<number | null> {
  const browser = await launchPuppeteer();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(UA);
    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const price = await page.evaluate(
      ({ priceSel, saleSel }: { priceSel: string; saleSel: string }) => {
        const pick = (t?: string | null) => {
          if (!t) return null;
          const m = t.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
          return m ? parseFloat(m[0]) : null;
        };

        const saleTxt = saleSel ? document.querySelector(saleSel)?.textContent ?? "" : "";
        const regTxt  = priceSel ? document.querySelector(priceSel)?.textContent ?? "" : "";
        const itemTxt =
          document.querySelector("[itemprop='price']")?.getAttribute?.("content") ||
          document.querySelector("[itemprop='price']")?.textContent ||
          "";

        return pick(saleTxt) ?? pick(regTxt) ?? pick(itemTxt) ?? null;
      },
      { priceSel: seller.price_selector || "", saleSel: seller.sale_selector || "" }
    );

    return price;
  } catch {
    return null;
  } finally {
    await page.close().catch(() => {});
    await (browser as any).close?.().catch?.(() => {});
  }
}

/**
 * Search a seller for a product and return candidate cards (link, price, small image buffer).
 */
export async function searchSeller(
  seller: Seller,
  product: Product
): Promise<Candidate[]> {
  const browser = await launchPuppeteer();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(UA);

    const searchUrl =
      seller.base_url +
      seller.search_url.replace(/\*/g, encodeURIComponent(product.search_term));

    try {
      await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30_000 });
    } catch {}

    // Help lazy lists / infinite scroll
    try {
      await page.evaluate(async () => {
        const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
        let last = 0;
        for (let i = 0; i < 6; i++) {
          window.scrollTo(0, document.body.scrollHeight);
          await delay(400);
          const h = document.body.scrollHeight;
          if (h === last) break;
          last = h;
        }
        window.scrollTo(0, 0);
      });
    } catch {}

    if (seller.product_selector) {
      try {
        await page.waitForSelector(seller.product_selector, { timeout: 8_000 });
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
      { link: string | null; price: number | null; img: string | null }[],
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
            // Link:
            let linkEl =
              (sel.link && (el.querySelector(sel.link) as HTMLAnchorElement | null)) ||
              (el.querySelector("a") as HTMLAnchorElement | null);
            const link = linkEl ? toAbs(linkEl.getAttribute("href") || linkEl.href, sel.base_url) : null;

            // Image:
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

            // Price:
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

    // Fetch image buffers server-side
    const out: Candidate[] = [];
    for (const c of cards) {
      let buf: Buffer | null = null;
      if (c.img) {
        try {
          const r = await fetch(c.img);
          const ab = await r.arrayBuffer();
          buf = Buffer.from(ab);
        } catch {
          buf = null;
        }
      }
      out.push({ link: c.link, price: c.price, img: buf });
    }
    return out;
  } finally {
    await page.close().catch(() => {});
    await (browser as any).close?.().catch?.(() => {});
  }
}
