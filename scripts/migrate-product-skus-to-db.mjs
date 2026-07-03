// scripts/migrate-product-skus-to-db.mjs
// Create the product_skus table and import entries from data/db/product-skus.ts.
// Idempotent: upserts by product_id.
import fs from "node:fs";
import sqlite3 from "sqlite3";

const ts = fs.readFileSync("data/db/product-skus.ts", "utf8");
const entryRe =
  /\{\s*productId:\s*"([^"]+)",\s*canonicalSku:\s*(?:"([^"]*)"|null),?\s*(?:skuAliases:\s*\[([^\]]*)\],?)?\s*(?:nameAliases:\s*\[([^\]]*)\],?)?\s*\}/g;

const parseList = (raw) =>
  raw
    ? [...raw.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'))
    : [];

const entries = [];
let m;
while ((m = entryRe.exec(ts))) {
  entries.push({
    productId: Number(m[1]),
    canonicalSku: m[2] || null,
    skuAliases: parseList(m[3]),
    nameAliases: parseList(m[4]),
  });
}
console.log("parsed entries from TS:", entries.length);

const db = new sqlite3.Database("data/db/data.sqlite");
const run = (s, p = []) => new Promise((res, rej) => db.run(s, p, function (e) { e ? rej(e) : res(this); }));
const get = (s, p = []) => new Promise((res, rej) => db.get(s, p, (e, r) => (e ? rej(e) : res(r))));

await run(fs.readFileSync("data/db/queries/create/product_skus.sql", "utf8"));
for (const e of entries) {
  await run(
    `INSERT INTO product_skus (product_id, canonical_sku, sku_aliases, name_aliases, source, updated_at)
     VALUES (?, ?, ?, ?, 'gw-algolia-match', datetime('now'))
     ON CONFLICT(product_id) DO UPDATE SET
       canonical_sku = excluded.canonical_sku,
       sku_aliases = excluded.sku_aliases,
       name_aliases = excluded.name_aliases,
       source = excluded.source,
       updated_at = excluded.updated_at`,
    [e.productId, e.canonicalSku, JSON.stringify(e.skuAliases), JSON.stringify(e.nameAliases)],
  );
}
const count = await get("SELECT COUNT(*) c FROM product_skus");
console.log("product_skus rows:", count.c);
db.close();
