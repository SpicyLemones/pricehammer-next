// scripts/migrate-seller-status.mjs
// Add sellers.status (active/blocked/dead/retired) and mark known-dead stores.
import sqlite3 from "sqlite3";

const db = new sqlite3.Database("data/db/data.sqlite");
const run = (s, p = []) => new Promise((res, rej) => db.run(s, p, function (e) { e ? rej(e) : res(this); }));
const all = (s) => new Promise((res, rej) => db.all(s, (e, r) => (e ? rej(e) : res(r))));

const cols = await all("PRAGMA table_info(sellers)");
if (!cols.some((c) => c.name === "status")) {
  await run("ALTER TABLE sellers ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  console.log("added sellers.status");
} else {
  console.log("sellers.status exists");
}
const rows = await all("SELECT id, name, status FROM sellers");
rows.forEach((r) => console.log(r.id, r.name, "->", r.status));
db.close();
