// scripts/reset-gw-seller-prices.mjs
// Full reset of the Warhammer Official seller's price rows for products with
// known canonical SKUs: mark them unvalidated so the SKU-keyed gw-algolia
// auto-validate re-accepts them with correct price+link.
// Products without SKU coverage are left untouched.
import fs from "node:fs";
import sqlite3 from "sqlite3";

const skusTs = fs.readFileSync("data/db/product-skus.ts", "utf8");
const productIds = [...skusTs.matchAll(/productId:\s*"(\d+)"/g)].map((m) => m[1]);
console.log("SKU-known products:", productIds.length);

const db = new sqlite3.Database("data/db/data.sqlite");
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));

const gw = await get("SELECT id, name FROM sellers WHERE name LIKE '%Warhammer%'");
if (!gw) { console.error("GW seller not found"); process.exit(1); }
console.log("GW seller:", gw.id, gw.name);

const before = await get(
  `SELECT COUNT(*) c FROM prices WHERE seller_id = ? AND validated = 1`, [gw.id]);
console.log("validated GW rows before:", before.c);

const placeholders = productIds.map(() => "?").join(",");
const r = await run(
  `UPDATE prices SET validated = NULL
   WHERE seller_id = ? AND product_id IN (${placeholders})`,
  [gw.id, ...productIds],
);
console.log("rows reset to unvalidated:", r.changes);

const after = await get(
  `SELECT COUNT(*) c FROM prices WHERE seller_id = ? AND validated = 1`, [gw.id]);
console.log("validated GW rows after:", after.c, "(untouched = products without SKUs)");
db.close();
