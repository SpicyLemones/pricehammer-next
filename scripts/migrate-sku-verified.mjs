// scripts/migrate-sku-verified.mjs — add prices.sku_verified for the
// link-verification job (1 = link SKU matches canonical, 0 = mismatch found).
import sqlite3 from "sqlite3";
const db = new sqlite3.Database("data/db/data.sqlite");
const run = (s) => new Promise((res, rej) => db.run(s, (e) => (e ? rej(e) : res())));
const all = (s) => new Promise((res, rej) => db.all(s, (e, r) => (e ? rej(e) : res(r))));
const cols = await all("PRAGMA table_info(prices)");
if (!cols.some((c) => c.name === "sku_verified")) {
  await run("ALTER TABLE prices ADD COLUMN sku_verified INTEGER");
  console.log("added prices.sku_verified");
} else console.log("prices.sku_verified exists");
db.close();
