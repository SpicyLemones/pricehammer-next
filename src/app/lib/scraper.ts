// src/app/lib/scraper.ts
// Server-only helpers for scraping. Safe to import from app routes with `runtime = "nodejs"`.

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
  evaluate<T, A = unknown>(fn: (a: A) => T | Promise<T>, arg: A): Promise<T>;
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
  // Try puppeteer-extra + stealth; if it explodes, fall back to plain puppeteer.
  try {
    const puppeteerExtra = (await import("puppeteer-extra")).default;
    const Stealth = (await import("puppeteer-extra-plugin-stealth")).default;
    // Some envs need construction, some accept function; both are fine:
    const plugin = typeof Stealth === "function" ? Stealth() : (Stealth as any).default?.() ?? Stealth;
    // In certain bundlers this line can throw — we guard the whole block.
    (puppeteerExtra as any).use(plugin);
    return await (puppeteerExtra as any).launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } catch {
    const puppeteer = (await import("puppeteer")).default;
    return await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
}

/** Extracts a number from a price-like string. */
function pickNumber(txt?: string | null): number | null {
  if (!txt) return null;
  const m = txt.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Try to read the first URL from a srcset attribute. */
function firstFromSrcset(srcset?: string | null): string | null {
  if (!srcset) return null;
  const first = srcset.split(",")[0]?.trim().split(" ")[0];
  return first || null;
}

/** Resolve possibly-relative URL against a base. */
function toAbs(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
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
      ({ priceSel, saleSel }) => {
        const pick = (t?: string | null) =>
          t ? parseFloat((t.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/) || [])[0] || "NaN") : NaN;

        const sale =
          saleSel ? (document.querySelector(saleSel)?.textContent ?? "") : "";
        const reg =
          priceSel ? (document.querySelector(priceSel)?.textContent ?? "") : "";
        const item =
          (document.querySelector("[itemprop='price']") as HTMLElement | null)?.getAttribute?.("content") ||
          (document.querySelector("[itemprop='price']")?.textContent ?? "") ||
          "";

        const vals = [sale, reg, item].map((x) => {
          if (!x) return NaN;
          const m = x.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
          return m ? parseFloat(m[0]) : NaN;
        });
        const best = vals.find((v) => Number.isFinite(v));
        return Number.isFinite(best as number) ? (best as number) : null;
      },
      { priceSel: seller.price_selector || "", saleSel: seller.sale_selector || "" }
    );

    return price;
  } catch {
    return null;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
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

    // Try to help infinite lists/lazy-loaders:
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
      product_selector: string;
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
        const pickNum = (txt?: string | null) => {
          if (!txt) return null;
          const m = txt.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
          return m ? parseFloat(m[0]) : null;
        };

        return nodes
          .map((el) => {
            // Link:
            let linkEl =
              (sel.link && (el.querySelector(sel.link) as HTMLAnchorElement | null)) ||
              (el.querySelector("a") as HTMLAnchorElement | null);
            const link = linkEl ? new URL((linkEl.getAttribute("href") || linkEl.href), sel.base_url).toString() : null;

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
            const imgLink = src ? new URL(src, sel.base_url).toString() : null;

            // Price (sale > regular > itemprop > generic .price):
            const saleText = sel.sale ? (el.querySelector(sel.sale)?.textContent ?? "") : "";
            const priceText = sel.price ? (el.querySelector(sel.price)?.textContent ?? "") : "";
            const itemPropText =
              (el.querySelector("[itemprop='price']") as HTMLElement | null)?.getAttribute?.("content") ||
              (el.querySelector("[itemprop='price']")?.textContent ?? "") ||
              "";
            const anyPriceText = (el.querySelector(".price")?.textContent ?? "");

            const price =
              pickNum(saleText) ??
              pickNum(priceText) ??
              pickNum(itemPropText) ??
              pickNum(anyPriceText) ??
              null;

            return { link, price, img: imgLink as any };
          })
          .filter((r) => !!r.link);
      },
      {
        base_url: seller.base_url,
        product_selector: seller.product_selector,
        name: seller.name_selector,
        link: seller.link_selector,
        img: seller.image_selector,
        price: seller.price_selector,
        sale: seller.sale_selector,
      }
    );

    // Fetch image buffers server-side (best-effort)
    const out: Candidate[] = [];
    for (const c of cards) {
      let buf: Buffer | null = null;
      if (c.img) {
        try {
          const r = await fetch(c.img as unknown as string);
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
    await browser.close().catch(() => {});
  }
}
