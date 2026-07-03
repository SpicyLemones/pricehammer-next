// scripts/match-gw-skus.mjs
//
// Match our product catalogue against the fetched GW Algolia catalogue
// (scripts/analysis-output/gw-catalogue.json) by normalized-name similarity,
// and cross-check against any SKUs the Puppeteer crawler already confirmed
// (scripts/analysis-output/gw-skus.json).
//
// READ-ONLY: writes analysis files only, does not touch product-skus.ts or the DB.
//   scripts/analysis-output/gw-sku-map.json   full mapping detail
//   scripts/analysis-output/gw-sku-review.csv rows needing human review
//
// Usage: node scripts/match-gw-skus.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "db", "data.sqlite");
const OUT_DIR = path.join(__dirname, "analysis-output");
const CATALOGUE = path.join(OUT_DIR, "gw-catalogue.json");
const CRAWLED = path.join(OUT_DIR, "gw-skus.json");

const HIGH = 0.85;
const MED = 0.6;

/* ---- shared name-normalization helpers ---- */
const STOP = new Set(["the","of","and","a","an","for","with","warhammer","citadel","games","workshop","gw","set","box","boxed","edition","new","plastic","kit","miniatures","miniature","aos","40k","40000"]);
const tok = (s) => !s ? [] : String(s).toLowerCase()
  .replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " ")
  .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ")
  .split(/\s+/).filter((t) => t && !STOP.has(t));
const sim = (a, b) => { if (!a.length || !b.length) return 0; const A = new Set(a), B = new Set(b); let i = 0; for (const t of A) if (B.has(t)) i++; return (2 * i) / (A.size + B.size); };
const normSku = (s) => { if (!s) return null; const t = String(s).match(/(\d{6,})\s*$/); if (t) return t[1]; const d = String(s).replace(/\D/g, ""); return d.length >= 5 ? d : null; };

function loadProducts() {
  return new Promise((res, rej) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
    db.all("SELECT id, name, search_term FROM products ORDER BY id", (e, rows) => { db.close(); e ? rej(e) : res(rows || []); });
  });
}

// Our validated Warhammer-Official prices — independent evidence for matching:
// if GW's Algolia price equals the price we already track for the product on
// warhammer.com, the identification is near-certain.
function loadOfficialPrices() {
  return new Promise((res, rej) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
    db.all(
      `SELECT pr.product_id, pr.price FROM prices pr
       JOIN sellers s ON s.id = pr.seller_id
       WHERE s.name LIKE '%warhammer%' AND pr.validated = 1 AND pr.price IS NOT NULL`,
      (e, rows) => {
        db.close();
        if (e) return rej(e);
        res(new Map((rows || []).map((r) => [String(r.product_id), Number(r.price)])));
      },
    );
  });
}

async function main() {
  const products = await loadProducts();
  const officialPrices = await loadOfficialPrices();
  const gw = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  let crawled = {};
  try { crawled = JSON.parse(fs.readFileSync(CRAWLED, "utf8")); } catch {}

  // pre-tokenize GW entries — name and slug separately (mixing them dilutes
  // exact name hits with faction-prefixed slugs)
  const singular = (t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);
  const norm = (arr) => arr.map(singular);
  for (const g of gw) {
    g._nameTokens = norm(tok(g.name));
    g._slugTokens = norm(tok(String(g.slug || "").replace(/-\d{4}$/, "").replace(/-/g, " ")));
    g._allTokens = [...new Set([...g._nameTokens, ...g._slugTokens])];
    g._normSku = normSku(g.sku);
  }

  // containment: how much of OUR name is present in the GW entry (recall).
  const containment = (ours, theirs) => {
    if (!ours.length) return 0;
    const T = new Set(theirs);
    let hit = 0;
    for (const t of ours) if (T.has(t)) hit++;
    return hit / ours.length;
  };

  // Different-scale/system lines: if GW's name carries one of these markers and
  // ours doesn't, it's a different physical product (e.g. epic-scale reissue).
  // pass markers through the same singular() normalization as real tokens
  const SYSTEM_MARKERS = ["legions", "imperialis", "epic", "middle", "earth", "underworlds", "warcry", "killteam", "necromunda"].map(singular);

  const scorePair = (ourTokens, g) => {
    if (!ourTokens.length) return 0;
    const ourSet = new Set(ourTokens);
    const markerMismatch = SYSTEM_MARKERS.some(
      (mk) => (g._nameTokens.includes(mk) || g._slugTokens.includes(mk)) && !ourSet.has(mk),
    );

    let s = Math.max(sim(ourTokens, g._nameTokens), sim(ourTokens, g._slugTokens));
    if (ourTokens.join(" ") === g._nameTokens.join(" ") && ourTokens.length >= 2) s = 1;
    // containment bonus only for multi-word names
    if (ourTokens.length >= 2) s = Math.max(s, 0.92 * containment(ourTokens, g._allTokens));
    // single generic words (Ancient, Chosen, Apothecary…) are too ambiguous to auto-accept
    if (ourTokens.length < 2) s = Math.min(s, 0.75);
    // cap scale/system mismatches below the auto-accept line
    if (markerMismatch) s = Math.min(s, 0.7);
    return s;
  };

  const map = [];
  let high = 0, med = 0, low = 0, crawlAgree = 0, crawlDisagree = 0;

  for (const p of products) {
    const nT = norm(tok(p.name)), sT = norm(tok(p.search_term));
    let best = null, bestScore = 0, second = 0;
    for (const g of gw) {
      const sc = Math.max(scorePair(nT, g), scorePair(sT, g));
      if (sc > bestScore) { second = bestScore; bestScore = sc; best = g; }
      else if (sc > second) second = sc;
    }

    const crawlSku = crawled[String(p.id)]?.status === "ok" ? crawled[String(p.id)].canonicalSku : null;
    let agree = null;
    if (crawlSku && best?._normSku) {
      agree = crawlSku === best._normSku;
      agree ? crawlAgree++ : crawlDisagree++;
    }

    // price cross-check vs our validated warhammer.com price. Our stored price
    // may be one annual GW price-rise old, so use three bands:
    //   ~equal (≤3%)      -> true  (promotes)
    //   wildly off (>25%) -> false (demotes — likely a different product)
    //   in between        -> null  (neutral)
    const ourGwPrice = officialPrices.get(String(p.id)) ?? null;
    let priceOk = null;
    if (ourGwPrice != null && best?.price != null) {
      const diff = Math.abs(best.price - ourGwPrice);
      if (diff <= Math.max(1, ourGwPrice * 0.03)) priceOk = true;
      else if (diff > ourGwPrice * 0.25) priceOk = false;
    }

    // bucket: name score first, then let independent evidence adjust.
    // NOTE: price contradiction does NOT demote — spot checks show those are
    // usually wrong prices in OUR db (old mis-validated links), not bad matches.
    // priceOk=false is kept in the output as a data-quality flag instead.
    let bucket = bestScore >= HIGH ? "high" : bestScore >= MED ? "medium" : "low";
    if (bucket === "medium" && (priceOk === true || agree === true)) bucket = "high"; // promoted by price/crawler agreement
    if (bucket === "high") high++; else if (bucket === "medium") med++; else low++;

    map.push({
      productId: String(p.id),
      name: p.name,
      searchTerm: p.search_term,
      bucket,
      score: Number(bestScore.toFixed(3)),
      margin: Number((bestScore - second).toFixed(3)), // gap to 2nd best = ambiguity signal
      gwName: best?.name ?? null,
      gwSlug: best?.slug ?? null,
      gwSku: best?.sku ?? null,
      canonicalSku: best?._normSku ?? null,
      gwPrice: best?.price ?? null,
      ourGwPrice,
      priceOk,
      crawledSku: crawlSku,
      crawlAgrees: agree,
    });
  }

  fs.writeFileSync(path.join(OUT_DIR, "gw-sku-map.json"), JSON.stringify(map, null, 1));

  const review = map.filter((m) => m.bucket !== "high" || m.crawlAgrees === false);
  const csv = [["productId","name","bucket","score","margin","gwName","canonicalSku","crawledSku","crawlAgrees"]]
    .concat(review.map((m) => [m.productId, m.name, m.bucket, m.score, m.margin, m.gwName, m.canonicalSku, m.crawledSku ?? "", m.crawlAgrees ?? ""]))
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  fs.writeFileSync(path.join(OUT_DIR, "gw-sku-review.csv"), csv);

  console.log(`products: ${products.length} | GW catalogue: ${gw.length}`);
  console.log(`match buckets: high(>=${HIGH})=${high} | medium=${med} | low=${low}`);
  console.log(`crawler cross-check: agree=${crawlAgree} disagree=${crawlDisagree}`);
  console.log(`review rows (medium/low/disagreements): ${review.length} -> gw-sku-review.csv`);
  console.log(`full map -> gw-sku-map.json`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
