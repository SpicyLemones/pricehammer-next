// scripts/crawl-gw-skus.mjs
//
// Crawl Warhammer.com to resolve a Games Workshop SKU for each catalogue product.
// For each product: search GW -> pick best name match -> open product page ->
// read JSON-LD sku -> normalize to the canonical manufacturer code.
//
// READ-ONLY w.r.t. the app DB. Writes results to scripts/analysis-output/gw-skus.json
// (resumable: already-resolved product ids are skipped on re-run).
//
// Usage:
//   node scripts/crawl-gw-skus.mjs --limit 25            # sample
//   node scripts/crawl-gw-skus.mjs                       # full run (slow, ~1hr)
//   node scripts/crawl-gw-skus.mjs --offset 200 --limit 100
//
// It does NOT overwrite product-skus.ts. Review gw-skus.json first.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";
import puppeteer from "puppeteer";
import pLimit from "p-limit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "db", "data.sqlite");
const OUT_DIR = path.join(ROOT, "scripts", "analysis-output");
const OUT_FILE = path.join(OUT_DIR, "gw-skus.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const BASE = "https://www.warhammer.com/en-AU/plp?search=";
const CONCURRENCY = 2;
const NAME_ACCEPT = 0.5; // min name score to bother opening a product page

/* ---- args ---- */
const args = process.argv.slice(2);
const getArg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const LIMIT = Number(getArg("--limit", "0")) || 0;
const OFFSET = Number(getArg("--offset", "0")) || 0;

/* ---- name matching (same approach as analyze-matching.mjs) ---- */
const STOP = new Set(["the","of","and","a","an","for","with","warhammer","citadel","games","workshop","gw","set","box","boxed","edition","new","plastic","kit","miniatures","miniature"]);
const tok = (s) => !s ? [] : String(s).toLowerCase().replace(/\[[^\]]*\]/g," ").replace(/\([^)]*\)/g," ").replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(t=>t&&!STOP.has(t));
const sim = (a,b) => { if(!a.length||!b.length) return 0; const A=new Set(a),B=new Set(b); let i=0; for(const t of A) if(B.has(t)) i++; return (2*i)/(A.size+B.size); };
const normSku = (s) => { if(!s) return null; const t=String(s).match(/(\d{6,})\s*$/); if(t) return t[1]; const d=String(s).replace(/\D/g,""); return d.length>=5?d:null; };

function loadProducts() {
  return new Promise((res, rej) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
    let sql = "SELECT id, name, search_term FROM products ORDER BY id";
    if (LIMIT) sql += ` LIMIT ${LIMIT} OFFSET ${OFFSET}`;
    db.all(sql, (e, rows) => { db.close(); e ? rej(e) : res(rows || []); });
  });
}

function loadExisting() {
  try { return JSON.parse(fs.readFileSync(OUT_FILE, "utf8")); } catch { return {}; }
}

async function searchAndResolve(browser, product) {
  const term = (product.search_term || product.name || "").trim();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ "accept-language": "en-AU,en;q=0.9" });
    await page.setViewport({ width: 1280, height: 900 });
    await new Promise((r) => setTimeout(r, Math.random() * 1500)); // jitter to ease throttling

    // fetch cards, with one retry if the grid doesn't render (GW throttling/slow JS)
    let cards = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.goto(BASE + encodeURIComponent(term), { waitUntil: "domcontentloaded", timeout: 30000 });
      try { await page.waitForSelector('[data-test="product-card"]', { timeout: 12000 }); } catch {}
      await page.evaluate(async () => { for (let i=0;i<3;i++){ window.scrollBy(0,1200); await new Promise(r=>setTimeout(r,300)); } });
      cards = await page.evaluate(() => {
        const out = [];
        for (const c of document.querySelectorAll('[data-test="product-card"]')) {
          const a = c.querySelector('a[href*="/shop/"]');
          const href = a?.href;
          if (!href || /\/shop\/cart/i.test(href)) continue;
          out.push({ href });
        }
        return out;
      });
      if (cards.length) break;
      await new Promise((r) => setTimeout(r, 2500 + Math.random() * 2000)); // back off then retry
    }

    if (!cards.length) return { productId: String(product.id), name: product.name, status: "no-results", term };

    // Derive a CLEAN title from the URL slug (avoids price/"Add to Cart" pollution).
    // e.g. .../shop/stormcast-eternals-vindictors-2021 -> "stormcast eternals vindictors"
    const slugTitle = (href) => {
      try {
        const slug = new URL(href).pathname.split("/").filter(Boolean).pop() || "";
        return slug.replace(/-\d{4}$/, "").replace(/-/g, " ");
      } catch { return ""; }
    };
    for (const c of cards) c.title = slugTitle(c.href);

    // pick best by name similarity (slug title vs our name/search_term)
    const nTokens = tok(product.name);
    const sTokens = tok(term);
    let best = null, bestScore = 0;
    for (const c of cards) {
      const t = tok(c.title);
      const score = Math.max(sim(nTokens, t), sim(sTokens, t));
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (!best || bestScore < NAME_ACCEPT) {
      return { productId: String(product.id), name: product.name, status: "low-name-match", term, bestScore: Number(bestScore.toFixed(3)), bestTitle: best?.title || null };
    }

    // open product page for SKU
    await page.goto(best.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
    const rawSku = await page.evaluate(() => {
      for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
        try { const j = JSON.parse(el.textContent || "null"); const arr = Array.isArray(j)?j:[j];
          for (const d of arr) if (d?.sku) return String(d.sku); } catch {}
      }
      const m = document.documentElement.innerHTML.match(/"sku"\s*:\s*"?([A-Za-z0-9-]{6,})"?/);
      return m ? m[1] : null;
    });

    return {
      productId: String(product.id), name: product.name, term,
      status: rawSku ? "ok" : "no-sku",
      bestScore: Number(bestScore.toFixed(3)),
      matchedTitle: best.title, url: best.href,
      rawSku, canonicalSku: normSku(rawSku),
    };
  } catch (e) {
    return { productId: String(product.id), name: product.name, status: "error", error: e.message };
  } finally {
    await page.close().catch(()=>{});
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const products = await loadProducts();
  const results = loadExisting();
  const todo = products.filter((p) => !results[String(p.id)] || ["error","no-results"].includes(results[String(p.id)]?.status));
  console.log(`Products: ${products.length} | already resolved: ${products.length - todo.length} | to do: ${todo.length}`);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox","--disable-setuid-sandbox","--disable-blink-features=AutomationControlled"] });
  const limit = pLimit(CONCURRENCY);
  let done = 0;
  await Promise.all(todo.map((p) => limit(async () => {
    const r = await searchAndResolve(browser, p);
    results[String(p.id)] = r;
    done++;
    if (done % 5 === 0 || r.status === "ok") {
      fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
      console.log(`[${done}/${todo.length}] p${r.productId} ${r.status} ${r.canonicalSku||""} <= "${(r.matchedTitle||r.bestTitle||"").slice(0,40)}" (${r.name.slice(0,30)})`);
    }
  })));
  await browser.close();
  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));

  // summary
  const vals = Object.values(results);
  const c = (s) => vals.filter(v=>v.status===s).length;
  console.log(`\n=== DONE ===`);
  console.log(`ok(sku): ${c("ok")} | no-sku: ${c("no-sku")} | low-name-match: ${c("low-name-match")} | no-results: ${c("no-results")} | error: ${c("error")}`);
  console.log(`Output: ${path.relative(ROOT, OUT_FILE)}`);
}

main().catch((e)=>{ console.error("FATAL", e); process.exit(1); });
