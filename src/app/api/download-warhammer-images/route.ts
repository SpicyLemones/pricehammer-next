import fs from "fs";
import path from "path";
import type { Browser, HTTPRequest, Page } from "puppeteer";
import pLimit from "p-limit";
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { fetchAllProductMetadata } from "@/app/lib/product-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PairRow = { seller_id: number; product_id: number; link: string | null };
type SellerRow = { id: number; name: string; base_url: string };
const OUT_DIR = path.join(process.cwd(), "public", "images", "product");
const MAX_RETRIES = Math.max(1, Number(process.env.WARHAMMER_SCRAPE_RETRIES || 3));
const BASE_THROTTLE_MS = Math.max(0, Number(process.env.WARHAMMER_SCRAPE_THROTTLE_MS || 1200));
const CONCURRENCY = Math.max(1, Number(process.env.WARHAMMER_SCRAPE_CONCURRENCY || 2));

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
];

// ────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────
function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeJpgBase(name: string) {
  // keep base-name only; normalize, strip weird chars; force .jpg
  const base = path.basename(name || "").toLowerCase();
  const noExt = base.replace(/\.[a-z0-9]+$/i, "");
  const slug = noExt
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (slug || "image") + ".jpg";
}

type PuppeteerModule = typeof import("puppeteer");

async function launchPuppeteer(): Promise<Browser> {
  const puppeteerModule: PuppeteerModule = await import("puppeteer");
  const puppeteer = puppeteerModule.default ?? puppeteerModule;
  const args = ["--no-sandbox", "--disable-setuid-sandbox"];
  if (process.env.PUPPETEER_PROXY) args.push(`--proxy-server=${process.env.PUPPETEER_PROXY}`);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args,
  });
  return browser;
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickUserAgent(attempt: number) {
  if (!USER_AGENTS.length) {
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  }
  return USER_AGENTS[(attempt - 1) % USER_AGENTS.length];
}

/** Extract the first JPG-ish product image URL from a Warhammer product page. */
/** Extract the currently displayed hero product image (JPG URL) from a Warhammer PDP. */
async function extractWarhammerJpg(link: string): Promise<string | null> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      const delay = withThrottleJitter();
      if (delay > 0) {
        await sleep(delay);
      }
    }

    const browser = await launchPuppeteer();
    const page: Page = await browser.newPage();
    const UA = pickUserAgent(attempt);

    try {
      await page.setUserAgent(UA);
      await page.setViewport({
        width: 1280 + Math.floor(Math.random() * 200),
        height: 720 + Math.floor(Math.random() * 200),
      });
      await page.setExtraHTTPHeaders?.({ "accept-language": "en-AU,en;q=0.9" });

      // Keep images enabled so currentSrc/srcset resolve.
      try {
        await page.setRequestInterception(true);
        page.on("request", (req: HTTPRequest) => {
          const t = req.resourceType?.() || "";
          const u = req.url?.() || "";
          if (t === "font" || t === "media" || /doubleclick|facebook|hotjar|gtag/i.test(u)) {
            req.abort().catch(() => {});
            return;
          }
          req.continue().catch(() => {});
        });
      } catch {}

      const response = await page.goto(link, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const status = response?.status?.() ?? null;
      if (!response || (status && status >= 400)) {
        throw new Error(`navigation-status-${status ?? "unknown"}`);
      }

      await page.waitForTimeout(300 + Math.random() * 200);
      await page.waitForSelector('img[src*="/app/resources/catalog/product/"]', {
        timeout: 10_000,
      }).catch(() => {});

      const blocked = await page.evaluate(() => {
        const txt = document.body?.innerText || "";
        return /access denied|request unsuccessful|temporary blocked|service unavailable/i.test(txt);
      });
      if (blocked) {
        throw new Error("warhammer-blocked");
      }

      const picked = await page.evaluate(() => {
        const CATALOG = /\/app\/resources\/catalog\/product\//i;

        const fromSrcset = (srcset?: string | null) => {
          if (!srcset) return null;
          const parts = srcset
            .split(",")
            .map((s) => s.trim())
            .map((s) => {
              const [u, size] = s.split(/\s+/);
              const w = parseInt((size || "").replace(/w$/i, ""), 10) || 0;
              return { u, w };
            })
            .filter((p) => p.u && CATALOG.test(p.u));
          if (!parts.length) return null;
          parts.sort((a, b) => b.w - a.w);
          return parts[0].u;
        };

        type Cand = { url: string; area: number; score: number };
        const cands: Cand[] = [];

        const add = (el: Element | null, url?: string | null, bonus = 0) => {
          if (!el || !url) return;
          if (!CATALOG.test(url)) return;
          const r = (el as HTMLElement).getBoundingClientRect?.() || { width: 0, height: 0 };
          const area = Math.max(0, r.width) * Math.max(0, r.height);
          // bonus lets us slightly prefer URLs that come from the same <picture> as the displayed <img>
          cands.push({ url, area, score: area + bonus });
        };

        // Look inside the gallery region first (if present)
        const root =
          (document.querySelector('[data-testid="pdp-gallery"], [data-testid="media-gallery"]') as HTMLElement) ||
          (document.querySelector('[data-testid*="hero"]') as HTMLElement) ||
          document.body;

        // 1) picture > source srcset (prefer the one paired with the visible <img>)
        root.querySelectorAll("picture").forEach((pic) => {
          const img = pic.querySelector("img");
          pic.querySelectorAll("source[srcset]").forEach((s) => {
            const best = fromSrcset((s as HTMLSourceElement).srcset);
            if (best) add(img || pic, best, 1); // +1 bonus if tied to the same picture as the displayed img
          });
        });

        // 2) <img currentSrc/src/srcset> for visible images
        root.querySelectorAll("img").forEach((img) => {
          const el = img as HTMLImageElement;
          add(el, el.currentSrc || el.getAttribute("src"));
          const best = fromSrcset(el.srcset || el.getAttribute("data-srcset"));
          if (best) add(el, best);
        });

        // 3) Fallback: any catalog <img> on the page
        if (!cands.length) {
          document.querySelectorAll("img").forEach((img) => {
            const el = img as HTMLImageElement;
            if (CATALOG.test(el.currentSrc)) add(el, el.currentSrc);
            else if (CATALOG.test(el.src)) add(el, el.src);
            else {
              const best = fromSrcset(el.srcset || el.getAttribute("data-srcset"));
              if (best) add(el, best);
            }
          });
        }

        if (!cands.length) return null;

        // Pick the candidate with the highest score (mostly largest visible area)
        cands.sort((a, b) => b.score - a.score);
        return cands[0].url;
      });

      if (!picked) {
        throw new Error("warhammer-no-image");
      }

      // Absolutize & prefer JPG over WEBP if present
      const abs = await page.evaluate((u: string) => {
        try {
          const out = new URL(u, location.href);
          if (out.searchParams.get("fm") === "webp") out.searchParams.set("fm", "jpg");
          if (out.searchParams.get("format") === "webp") out.searchParams.set("format", "jpg");
          return out.toString();
        } catch {
          return u;
        }
      }, picked);

      return abs;
    } catch (err) {
      lastError = err;
      console.log(`[images] retry attempt=${attempt} url=${link} err=${errorMessage(err)}`);
    } finally {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }

  console.log(`[images] giving up url=${link} after ${MAX_RETRIES} attempts`, errorMessage(lastError));
  return null;
}

function withThrottleJitter() {
  if (BASE_THROTTLE_MS <= 0) return 0;
  return BASE_THROTTLE_MS + Math.random() * BASE_THROTTLE_MS;
}

function errorMessage(input: unknown) {
  if (input instanceof Error) return input.message;
  if (input === undefined) return "undefined";
  if (input === null) return "null";
  if (typeof input === "string") return input;
  if (typeof input === "number" || typeof input === "boolean") return String(input);
  try {
    const str = JSON.stringify(input);
    if (typeof str === "string") return str;
  } catch {}
  return String(input);
}


// ────────────────────────────────────────────────
// Route
// ────────────────────────────────────────────────
export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const sellerOverride = url.searchParams.get("seller");

  ensureDir(OUT_DIR);

  // 1) figure out Warhammer seller id
  let sellerId: number | null = null;

  if (sellerOverride) {
    const s = await query("get", "select/seller_id", [sellerOverride]);
    sellerId = s?.id ?? null;
  } else {
    const sellers = (await query("all", "select/all_sellers")) as SellerRow[];
    const war = sellers.find((s) => /warhammer/i.test(s.name));
    sellerId = war?.id ?? null;
  }

  if (!sellerId) {
    return NextResponse.json({ ok: false, error: "Warhammer seller not found. Pass ?seller=<id>." }, { status: 400 });
  }

  // 2) get all validated pairs for that seller
  const pairs = (await query("all", "select/validated_pairs_by_seller", [sellerId])) as PairRow[];
  if (!pairs?.length) {
    return NextResponse.json({ ok: false, error: "No validated pairs for this seller." }, { status: 404 });
  }

  // 3) load product metadata from the database (image filenames, display names)
  const metadataRows = await fetchAllProductMetadata();
  const byId = new Map<string, { image?: string | null; name?: string }>();
  metadataRows.forEach((row) => {
    byId.set(String(row.productId), {
      image: row.image,
      name: row.displayName,
    });
  });

  // 4) download with concurrency
  const limit = pLimit(CONCURRENCY);
  let saved = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`[images] Start Warhammer scrape: ${pairs.length} products (force=${force ? "yes" : "no"})`);

  await Promise.all(
    pairs.map((row) =>
      limit(async () => {
        const link = (row.link || "").trim();
        if (!link) {
          failed++;
          return;
        }

        // filename from manual image (fallback: product name)
        const meta = byId.get(String(row.product_id));
        const base = safeJpgBase(meta?.image || meta?.name || `product-${row.product_id}`);
        const outPath = path.join(OUT_DIR, base);

        if (!force && fs.existsSync(outPath)) {
          skipped++;
          return;
        }

        try {
          const beforeDelay = withThrottleJitter();
          if (beforeDelay > 0) {
            await sleep(beforeDelay);
          }

          const imgUrl = await extractWarhammerJpg(link);
          if (!imgUrl) {
            failed++;
            console.log(`[images] no image: p=${row.product_id} url=${link}`);
            return;
          }

          const resp = await fetch(imgUrl);
          if (!resp.ok) {
            failed++;
            console.log(`[images] fetch fail: ${imgUrl} p=${row.product_id} status=${resp.status}`);
            return;
          }

          const ab = await resp.arrayBuffer();
          fs.writeFileSync(outPath, Buffer.from(ab));
          saved++;
          console.log(`[images] saved p=${row.product_id} -> ${base}`);
        } catch (err) {
          failed++;
          console.log(`[images] error p=${row.product_id}:`, errorMessage(err));
        }
      })
    )
  );

  console.log(`[images] Done. saved=${saved} skipped=${skipped} failed=${failed}`);

  return NextResponse.json({
    ok: true,
    sellerId,
    total: pairs.length,
    saved,
    skipped,
    failed,
    outDir: `/images/product/`,
  });
}
