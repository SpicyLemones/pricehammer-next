// scripts/backfill-universe-tags.mjs
// Tag every SKU-mapped product's universe (product_metadata.game) from GW's
// own GameSystemsRoot hierarchy. Sub-games (Kill Team, Necromunda...) win
// over the parent system when GW tags both.
import fs from "node:fs";
import sqlite3 from "sqlite3";

const APPLY = process.argv.includes("--apply");
const gw = JSON.parse(fs.readFileSync("scripts/analysis-output/gw-catalogue.json", "utf8"));
const norm = (s) => { if (!s) return null; const t = String(s).match(/(\d{6,})\s*$/); if (t) return t[1]; const d = String(s).replace(/\D/g, ""); return d.length >= 5 ? d : null; };

const SUB_GAMES = {
  "Kill Team": "killteam",
  "Necromunda": "necromunda",
  "Blood Bowl": "bloodbowl",
  "Legions Imperialis": "legionsimperialis",
  "Warcry": "warcry",
  "Warhammer Underworlds": "underworlds",
  "Underworlds": "underworlds",
  "Adeptus Titanicus": "adeptustitanicus",
  "Warhammer Quest": "warhammerquest",
};
const MAIN_GAMES = {
  "Warhammer 40,000": "warhammer40k",
  "Age of Sigmar": "ageofsigmar",
  "The Horus Heresy": "horusheresy",
  "The Old World": "oldworld",
  "Middle-Earth": "middleearth",
};

function slugFor(item) {
  for (const l of item.gameLvl1 ?? []) {
    const m = l.match(/^Other Games > (.+)$/);
    if (m && SUB_GAMES[m[1]]) return SUB_GAMES[m[1]];
  }
  // priority order for main systems when multiple present
  for (const name of Object.keys(MAIN_GAMES)) {
    if ((item.gameLvl0 ?? []).includes(name)) return MAIN_GAMES[name];
  }
  if ((item.gameLvl0 ?? []).length) return "other";
  return null;
}

const bySku = new Map();
for (const g of gw) { const n = norm(g.sku); if (n) bySku.set(n, slugFor(g)); }

const db = new sqlite3.Database("data/db/data.sqlite");
const all = (s, p = []) => new Promise((res, rej) => db.all(s, p, (e, r) => (e ? rej(e) : res(r))));
const run = (s, p = []) => new Promise((res, rej) => db.run(s, p, function (e) { e ? rej(e) : res(this); }));

const rows = await all(`
  SELECT ps.product_id, ps.canonical_sku, m.game
  FROM product_skus ps JOIN product_metadata m ON m.product_id = ps.product_id`);

const counts = {}; let changed = 0, unknown = 0;
for (const r of rows) {
  const slug = bySku.get(r.canonical_sku);
  if (!slug) { unknown++; continue; }
  counts[slug] = (counts[slug] || 0) + 1;
  if (slug !== r.game) {
    changed++;
    if (APPLY) {
      await run(`UPDATE product_metadata SET game = ?, updated_at = datetime('now') WHERE product_id = ?`, [slug, r.product_id]);
    }
  }
}
console.log("universe counts:", JSON.stringify(counts));
console.log(`sku-mapped: ${rows.length} | changed: ${changed} | not in catalogue: ${unknown}`);
console.log(APPLY ? "APPLIED" : "dry run — use --apply");
db.close();
