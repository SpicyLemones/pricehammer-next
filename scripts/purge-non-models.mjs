// scripts/purge-non-models.mjs
//
// Remove non-model products (paints, dice, books/codexes, card decks, bases,
// vouchers, gaming accessories) so the catalogue is models only.
//
// Classification, in priority order:
//   1. GW productType via canonical SKU (authoritative when known)
//   2. metadata category (Dice / Paints / Book / Black Library-books / Codex...)
//   3. name heuristics for the SKU-less stragglers
// Upgrade sprues / transfers and terrain are plastic kits and are KEPT.
//
// Usage:
//   node scripts/purge-non-models.mjs           # dry run, prints the list
//   node scripts/purge-non-models.mjs --apply   # backs up DB then deletes
import fs from "node:fs";
import sqlite3 from "sqlite3";

const APPLY = process.argv.includes("--apply");

const REMOVE_GW_TYPES = new Set([
  "rulebookCards", "base", "accessory", "gamingAccessory",
  "virtualGiftVoucher", "paint", "brush", "book", "magazine", "bundle",
]);
const KEEP_GW_TYPES = new Set(["miniatureKit", "boxedSet"]);
const REMOVE_CATEGORIES = new Set(["Dice", "Paints", "Book", "Codex/Battletome"]);
const NAME_RX =
  /codex|battletome|datasheet cards|mission deck|\bdice\b|paint(s)? set|paints \+|crusade:|chapter approved|getting started|combat gauge|index cards|card pack|battle journal|how to paint/i;

const gw = JSON.parse(fs.readFileSync("scripts/analysis-output/gw-catalogue.json", "utf8"));
const norm = (s) => { if (!s) return null; const t = String(s).match(/(\d{6,})\s*$/); if (t) return t[1]; const d = String(s).replace(/\D/g, ""); return d.length >= 5 ? d : null; };
const typeBySku = new Map();
for (const g of gw) { const n = norm(g.sku); if (n) typeBySku.set(n, g.productType); }

const db = new sqlite3.Database("data/db/data.sqlite");
const all = (s, p = []) => new Promise((res, rej) => db.all(s, p, (e, r) => (e ? rej(e) : res(r))));
const run = (s, p = []) => new Promise((res, rej) => db.run(s, p, function (e) { e ? rej(e) : res(this); }));

const rows = await all(`
  SELECT p.id, p.name, m.category, ps.canonical_sku
  FROM products p
  LEFT JOIN product_metadata m ON m.product_id = p.id
  LEFT JOIN product_skus ps ON ps.product_id = p.id`);

const toRemove = [];
for (const r of rows) {
  const gwType = r.canonical_sku ? typeBySku.get(r.canonical_sku) : undefined;
  let verdict = null;
  if (gwType && KEEP_GW_TYPES.has(gwType)) verdict = null; // GW says it's a kit
  else if (gwType && REMOVE_GW_TYPES.has(gwType)) verdict = `gw-type:${gwType}`;
  else if (r.category && REMOVE_CATEGORIES.has(r.category)) verdict = `category:${r.category}`;
  else if (NAME_RX.test(r.name)) verdict = `name-match`;
  if (verdict) toRemove.push({ id: r.id, name: r.name, why: verdict });
}

console.log(`products total: ${rows.length} | to remove: ${toRemove.length}`);
const byWhy = {};
for (const t of toRemove) { const k = t.why.split(":")[0]; byWhy[k] = (byWhy[k] || 0) + 1; }
console.log("by reason:", JSON.stringify(byWhy));
toRemove.forEach((t) => console.log(`  [${t.why}] ${t.name}`));

if (!APPLY) {
  console.log("\nDry run — re-run with --apply to delete.");
  db.close();
  process.exit(0);
}

// backup DB + removal manifest
fs.copyFileSync("data/db/data.sqlite", "data/db/data.backup-pre-purge.sqlite");
fs.writeFileSync("scripts/analysis-output/purged-products.json", JSON.stringify(toRemove, null, 1));

const ids = toRemove.map((t) => t.id);
const CHUNK = 200;
let prices = 0, skus = 0, meta = 0, prods = 0;
for (let i = 0; i < ids.length; i += CHUNK) {
  const chunk = ids.slice(i, i + CHUNK);
  const ph = chunk.map(() => "?").join(",");
  prices += (await run(`DELETE FROM prices WHERE product_id IN (${ph})`, chunk)).changes;
  skus += (await run(`DELETE FROM product_skus WHERE product_id IN (${ph})`, chunk)).changes;
  meta += (await run(`DELETE FROM product_metadata WHERE product_id IN (${ph})`, chunk)).changes;
  prods += (await run(`DELETE FROM products WHERE id IN (${ph})`, chunk)).changes;
}
console.log(`\ndeleted: products=${prods} metadata=${meta} skus=${skus} price-rows=${prices}`);
console.log("backup: data/db/data.backup-pre-purge.sqlite");
console.log("manifest: scripts/analysis-output/purged-products.json");
db.close();
