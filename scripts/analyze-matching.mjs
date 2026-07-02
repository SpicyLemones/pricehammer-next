// scripts/analyze-matching.mjs
//
// READ-ONLY analysis harness. Makes NO writes to the DB and NO changes to files.
// Purpose: give a baseline picture of (1) which seller sites are reachable/down,
// and (2) how well the product catalogue matches each Shopify store's feed today,
// so we can choose an auto-accept threshold with real numbers.
//
// Run from repo root:  node scripts/analyze-matching.mjs
//
// It prints a summary to stdout and writes a detailed CSV next to the repo
// (scripts/analysis-output/matches.csv) for eyeballing low-confidence rows.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "db", "data.sqlite");
const SELLERS_JSON = path.join(ROOT, "data", "db", "json", "sellers.json");
const SKUS_TS = path.join(ROOT, "data", "db", "product-skus.ts");
const OUT_DIR = path.join(ROOT, "scripts", "analysis-output");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_FEED_PAGES = 20; // 250 * 20 = up to 5000 products per store
const HIGH = 0.85; // >= this normalized-name score = high-confidence
const LOW = 0.6; // >= this but < HIGH = low-confidence (needs review)

/* ---------------- helpers ---------------- */
const STOPWORDS = new Set([
  "the", "of", "and", "a", "an", "for", "with", "warhammer", "citadel",
  "games", "workshop", "gw", "40k", "40000", "aos", "sigmar", "set", "box",
  "boxed", "miniatures", "miniature", "edition", "new", "pre", "order",
  "preorder", "plastic", "kit",
]);

function normalizeTokens(str) {
  if (!str) return [];
  return String(str)
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ") // [PRE-ORDER] etc
    .replace(/\([^)]*\)/g, " ")
    .replace(/&amp;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

// Dice coefficient over token sets (0..1)
function similarity(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return (2 * inter) / (a.size + b.size);
}

// Mirror of the documented Shopify SKU normalization: prefer a trailing 6+ digit
// manufacturer code (e.g. prod4780167-99120218061 -> 99120218061).
function normalizeSku(sku) {
  if (!sku) return null;
  const s = String(sku).trim();
  const tail = s.match(/(\d{6,})\s*$/);
  if (tail) return tail[1];
  const digits = s.replace(/\D/g, "");
  return digits.length >= 5 ? digits : null;
}

function parseCanonicalSkus() {
  // product-skus.ts is TS; parse it lightly by regex rather than importing.
  const map = new Map(); // productId(string) -> normalizedSku
  try {
    const txt = fs.readFileSync(SKUS_TS, "utf8");
    const re =
      /productId:\s*"([^"]+)"[\s\S]*?canonicalSku:\s*(?:"([^"]*)"|null)/g;
    let m;
    while ((m = re.exec(txt))) {
      const pid = m[1];
      const sku = m[2] ? normalizeSku(m[2]) : null;
      if (sku) map.set(pid, sku);
    }
  } catch {}
  return map;
}

function allProducts() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
    db.all("SELECT id, name, search_term FROM products", (e, rows) => {
      db.close();
      if (e) reject(e);
      else resolve(rows || []);
    });
  });
}

async function timedFetch(url, opts = {}, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...opts,
      redirect: "follow",
      signal: ctl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "en-AU,en;q=0.9", ...(opts.headers || {}) },
    });
  } finally {
    clearTimeout(t);
  }
}

async function healthCheck(baseUrl) {
  try {
    const res = await timedFetch(baseUrl, { headers: { Accept: "text/html" } }, 15000);
    const cf = res.headers.get("cf-mitigated");
    if (cf) return { status: "blocked", detail: `cf:${cf} (${res.status})` };
    if (res.status === 403) return { status: "blocked", detail: "403" };
    if (res.ok) return { status: "ok", detail: String(res.status) };
    return { status: "other", detail: String(res.status) };
  } catch (e) {
    return { status: "down", detail: e?.cause?.code || e?.name || "conn-fail" };
  }
}

async function fetchShopifyFeed(baseUrl) {
  // returns array of { title, handle, price, skus:[normalized...] } or throws
  const clean = baseUrl.replace(/\/+$/, "");
  const products = [];
  for (let page = 1; page <= MAX_FEED_PAGES; page++) {
    const url = `${clean}/products.json?limit=250&page=${page}`;
    const res = await timedFetch(url, { headers: { Accept: "application/json" } }, 20000);
    if (!res.ok) {
      if (page === 1) throw new Error(`feed http ${res.status}`);
      break;
    }
    let json;
    try {
      json = await res.json();
    } catch {
      if (page === 1) throw new Error("feed not json");
      break;
    }
    const batch = json?.products || [];
    if (!batch.length) break;
    for (const p of batch) {
      const variants = Array.isArray(p.variants) ? p.variants : [];
      const skus = [];
      let price = null;
      for (const v of variants) {
        const ns = normalizeSku(v?.sku);
        if (ns) skus.push(ns);
        if (price == null && v?.price != null) price = Number(v.price);
      }
      products.push({
        title: p.title || "",
        handle: p.handle || "",
        price,
        skus,
        titleTokens: normalizeTokens(p.title || ""),
      });
    }
    if (batch.length < 250) break;
  }
  return products;
}

/* ---------------- main ---------------- */
async function main() {
  const sellers = JSON.parse(fs.readFileSync(SELLERS_JSON, "utf8"));
  const products = await allProducts();
  const canonicalSkus = parseCanonicalSkus();

  console.log(`\nCatalogue: ${products.length} products | known canonical SKUs: ${canonicalSkus.size}\n`);

  // pre-tokenize catalogue
  const cat = products.map((p) => ({
    id: String(p.id),
    name: p.name,
    tokensName: normalizeTokens(p.name),
    tokensSearch: normalizeTokens(p.search_term),
    sku: canonicalSkus.get(String(p.id)) || null,
  }));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const csvRows = [["seller", "product_id", "product_name", "bucket", "score", "reason", "best_feed_title"]];

  const summary = [];

  for (const s of sellers) {
    const platform = s?.storefront?.platform || "misc";
    const health = await healthCheck(s.base_url);

    const row = {
      seller: s.name,
      platform,
      health: `${health.status} (${health.detail})`,
      feed: "-",
      bySku: 0,
      byNameHigh: 0,
      lowConf: 0,
      unmatched: 0,
    };

    if (platform === "shopify" && health.status !== "down") {
      try {
        const feed = await fetchShopifyFeed(s.base_url);
        row.feed = `${feed.length} products`;
        const feedSkuSet = new Set();
        for (const f of feed) for (const k of f.skus) feedSkuSet.add(k);

        for (const p of cat) {
          let bucket, score = 0, reason = "", bestTitle = "";

          if (p.sku && feedSkuSet.has(p.sku)) {
            bucket = "sku";
            score = 1;
            reason = "sku-exact";
          } else {
            // best name similarity across feed
            let best = 0, bestF = null;
            for (const f of feed) {
              const sc = Math.max(
                similarity(p.tokensName, f.titleTokens),
                similarity(p.tokensSearch, f.titleTokens)
              );
              if (sc > best) { best = sc; bestF = f; }
            }
            score = Number(best.toFixed(3));
            bestTitle = bestF?.title || "";
            reason = "fuzzy-name";
            bucket = best >= HIGH ? "name-high" : best >= LOW ? "low" : "unmatched";
          }

          if (bucket === "sku") row.bySku++;
          else if (bucket === "name-high") row.byNameHigh++;
          else if (bucket === "low") row.lowConf++;
          else row.unmatched++;

          if (bucket !== "unmatched") {
            csvRows.push([s.name, p.id, p.name, bucket, score, reason, bestTitle]);
          }
        }
      } catch (e) {
        row.feed = `ERROR: ${e.message}`;
      }
    }

    summary.push(row);
    console.log(
      `• ${row.seller.padEnd(20)} [${platform.padEnd(6)}] health=${row.health.padEnd(22)} feed=${row.feed}`
    );
    if (platform === "shopify" && typeof row.feed === "string" && row.feed.includes("products")) {
      const total = cat.length;
      const pct = (n) => `${((n / total) * 100).toFixed(1)}%`;
      console.log(
        `    matched: sku=${row.bySku} nameHigh=${row.byNameHigh} (${pct(row.bySku + row.byNameHigh)}) | low=${row.lowConf} | unmatched=${row.unmatched}`
      );
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "matches.csv"),
    csvRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
  );

  console.log(`\nDetail CSV: ${path.join("scripts", "analysis-output", "matches.csv")}`);
  console.log("(sku + name-high = would auto-accept; low = needs review/tinder; unmatched = no candidate)\n");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
