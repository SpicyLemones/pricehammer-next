import fs from "fs";
import path from "path";
import pLimit from "p-limit";
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PairRow = { seller_id: number; product_id: number; link: string | null };
type SellerRow = { id: number; name: string; base_url: string };
type ProductRow = { id: number; name: string; search_term: string };

const OUT_DIR = path.join(process.cwd(), "public", "images", "product");

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

function absolutize(url: string, base: string) {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

async function launchPuppeteer() {
  const puppeteer = (await import("puppeteer")).default as any;
  const args = ["--no-sandbox", "--disable-setuid-sandbox"];
  if (process.env.PUPPETEER_PROXY) args.push(`--proxy-server=${process.env.PUPPETEER_PROXY}`);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args,
  });
  return browser as any;
}

/** Extract the first JPG-ish product image URL from a Warhammer product page. */
/** Extract the currently displayed hero product image (JPG URL) from a Warhammer PDP. */
async function extractWarhammerJpg(link: string): Promise<string | null> {
  const browser = await launchPuppeteer();
  const page = await browser.newPage();
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  try {
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders?.({ "accept-language": "en-AU,en;q=0.9" });

    // Keep images enabled so currentSrc/srcset resolve.
    try {
      await (page as any).setRequestInterception?.(true);
      (page as any).on?.("request", (req: any) => {
        const t = req.resourceType?.() || "";
        const u = req.url?.() || "";
        if (t === "font" || t === "media" || /doubleclick|facebook|hotjar|gtag/i.test(u)) {
          return req.abort();
        }
        return req.continue();
      });
    } catch {}

    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));

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

    if (!picked) return null;

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
  } catch {
    return null;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
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

  // 3) load manual product metadata (to get desired image filenames)
  let manual: { Products: Array<{ id: string; name?: string; image?: string }> };
  try {
    // adjust path if your file lives elsewhere
    manual = (await import("../../../../data/db/Product")) as any;
  } catch {
    manual = { Products: [] };
  }
  const byId = new Map<string, { image?: string; name?: string }>();
  manual.Products.forEach((p) => byId.set(String(p.id), { image: p.image, name: p.name }));

  // 4) download with concurrency
  const limit = pLimit(3);
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
        let base = safeJpgBase(
          byId.get(String(row.product_id))?.image ||
            byId.get(String(row.product_id))?.name ||
            `product-${row.product_id}`
        );
        const outPath = path.join(OUT_DIR, base);

        if (!force && fs.existsSync(outPath)) {
          skipped++;
          return;
        }

        try {
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
        } catch (e) {
          failed++;
          console.log(`[images] error p=${row.product_id}:`, (e as any)?.message || e);
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
