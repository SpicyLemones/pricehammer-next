// scripts/backfill-gw-images.mjs
// Point product_metadata.image at the official GW catalogue image for every
// product whose canonical SKU appears in the GW Algolia catalogue.
import fs from "node:fs";
import sqlite3 from "sqlite3";

const APPLY = process.argv.includes("--apply");
const gw = JSON.parse(fs.readFileSync("scripts/analysis-output/gw-catalogue.json", "utf8"));
const norm = (s) => { if (!s) return null; const t = String(s).match(/(\d{6,})\s*$/); if (t) return t[1]; const d = String(s).replace(/\D/g, ""); return d.length >= 5 ? d : null; };
const imageBySku = new Map();
for (const g of gw) { const n = norm(g.sku); if (n && g.image) imageBySku.set(n, g.image); }
console.log("GW images available:", imageBySku.size);

const db = new sqlite3.Database("data/db/data.sqlite");
const all = (s, p = []) => new Promise((res, rej) => db.all(s, p, (e, r) => (e ? rej(e) : res(r))));
const run = (s, p = []) => new Promise((res, rej) => db.run(s, p, function (e) { e ? rej(e) : res(this); }));

const rows = await all(`
  SELECT ps.product_id, ps.canonical_sku, m.image
  FROM product_skus ps
  JOIN product_metadata m ON m.product_id = ps.product_id`);

let toUpdate = 0, already = 0, noImage = 0;
for (const r of rows) {
  const url = imageBySku.get(r.canonical_sku);
  if (!url) { noImage++; continue; }
  if (r.image === url) { already++; continue; }
  toUpdate++;
  if (APPLY) {
    await run(`UPDATE product_metadata SET image = ?, updated_at = datetime('now') WHERE product_id = ?`, [url, r.product_id]);
  }
}
console.log(`sku-mapped products: ${rows.length} | would update: ${toUpdate} | already GW url: ${already} | no GW image: ${noImage}`);
console.log(APPLY ? "APPLIED" : "dry run — use --apply");
db.close();
