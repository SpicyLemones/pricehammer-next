// scripts/migrate-seller-storefront.mjs
// Add the missing sellers.storefront column (older DBs predate it) and
// backfill config from data/db/json/sellers.json, matched by seller name.
import fs from "node:fs";
import sqlite3 from "sqlite3";

const db = new sqlite3.Database("data/db/data.sqlite");
const seed = JSON.parse(fs.readFileSync("data/db/json/sellers.json", "utf8"));

const run = (sql, params = []) =>
  new Promise((res, rej) => db.run(sql, params, function (e) { e ? rej(e) : res(this); }));
const all = (sql) =>
  new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));

const cols = await all("PRAGMA table_info(sellers)");
if (!cols.some((c) => c.name === "storefront")) {
  await run("ALTER TABLE sellers ADD COLUMN storefront TEXT");
  console.log("added sellers.storefront column");
} else {
  console.log("sellers.storefront column already exists");
}

for (const s of seed) {
  if (!s.storefront) continue;
  const r = await run("UPDATE sellers SET storefront = ? WHERE name = ?", [
    JSON.stringify(s.storefront),
    s.name,
  ]);
  console.log(`${s.name}: ${r.changes} row(s) -> ${JSON.stringify(s.storefront).slice(0, 60)}`);
}

const rows = await all("SELECT id, name, substr(storefront,1,50) AS sf FROM sellers");
rows.forEach((r) => console.log(r.id, r.name, "|", r.sf));
db.close();
