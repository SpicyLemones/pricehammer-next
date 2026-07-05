// scripts/backfill-release-flags.mjs — mirror GW's isNewRelease/isPreOrder
// onto product_metadata so /new-releases can showcase the latest kits.
import fs from "node:fs";
import sqlite3 from "sqlite3";

const gw = JSON.parse(fs.readFileSync("scripts/analysis-output/gw-catalogue.json", "utf8"));
const norm = (s) => { if (!s) return null; const t = String(s).match(/(\d{6,})\s*$/); if (t) return t[1]; const d = String(s).replace(/\D/g, ""); return d.length >= 5 ? d : null; };
const flags = new Map();
for (const g of gw) { const n = norm(g.sku); if (n) flags.set(n, { nr: g.isNewRelease ? 1 : 0, po: g.isPreOrder ? 1 : 0 }); }

const db = new sqlite3.Database("data/db/data.sqlite");
const all = (s, p = []) => new Promise((res, rej) => db.all(s, p, (e, r) => (e ? rej(e) : res(r))));
const run = (s, p = []) => new Promise((res, rej) => db.run(s, p, function (e) { e ? rej(e) : res(this); }));

const cols = await all("PRAGMA table_info(product_metadata)");
for (const c of ["is_new_release", "is_pre_order"]) {
  if (!cols.some((x) => x.name === c)) await run(`ALTER TABLE product_metadata ADD COLUMN ${c} INTEGER DEFAULT 0`);
}

const rows = await all(`SELECT ps.product_id, ps.canonical_sku FROM product_skus ps`);
let nr = 0, po = 0;
for (const r of rows) {
  const f = flags.get(r.canonical_sku) ?? { nr: 0, po: 0 };
  await run(`UPDATE product_metadata SET is_new_release = ?, is_pre_order = ? WHERE product_id = ?`, [f.nr, f.po, r.product_id]);
  nr += f.nr; po += f.po;
}
console.log(`flagged: newRelease=${nr} preOrder=${po} of ${rows.length}`);
db.close();
