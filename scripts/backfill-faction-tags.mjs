// scripts/backfill-faction-tags.mjs
// Backfill factions from GW's GameSystemsRoot hierarchy:
//   40k: "Warhammer 40,000 > (Armies of the Imperium|Armies of Chaos|Xenos Armies) > F"
//        plus the lvl1-direct "Warhammer 40,000 > Space Marines"
//   AoS: "Age of Sigmar > Grand Alliance X > F"
//   HH:  "The Horus Heresy > (Loyalist|Traitor) Legiones Astartes > F"
// Multiple factions per product are kept (factions JSON column); the primary
// (faction) is the first one from the product's PRIMARY universe.
// Existing curated faction is kept when GW yields nothing.
import fs from "node:fs";
import sqlite3 from "sqlite3";

const APPLY = process.argv.includes("--apply");
const gw = JSON.parse(fs.readFileSync("scripts/analysis-output/gw-catalogue.json", "utf8"));
const norm = (s) => { if (!s) return null; const t = String(s).match(/(\d{6,})\s*$/); if (t) return t[1]; const d = String(s).replace(/\D/g, ""); return d.length >= 5 ? d : null; };

const FACTION_RULES = [
  { game: "warhammer40k", rx: /^Warhammer 40,000 > (?:Armies of the Imperium|Armies of Chaos|Xenos Armies) > (.+)$/ },
  { game: "ageofsigmar", rx: /^Age of Sigmar > Grand Alliance [^>]+ > (.+)$/ },
  { game: "horusheresy", rx: /^The Horus Heresy > (?:Loyalist|Traitor) Legiones Astartes > (.+)$/ },
];

function factionsFor(item) {
  const byGame = new Map(); // game -> ordered set of factions
  const add = (game, f) => {
    if (!byGame.has(game)) byGame.set(game, []);
    const arr = byGame.get(game);
    if (!arr.includes(f)) arr.push(f);
  };
  for (const l of item.gameLvl2 ?? []) {
    for (const { game, rx } of FACTION_RULES) {
      const m = l.match(rx);
      if (m) add(game, m[1].trim());
    }
  }
  if ((item.gameLvl1 ?? []).includes("Warhammer 40,000 > Space Marines")) {
    add("warhammer40k", "Space Marines");
  }
  return byGame;
}

const bySku = new Map();
for (const g of gw) { const n = norm(g.sku); if (n) bySku.set(n, factionsFor(g)); }

const db = new sqlite3.Database("data/db/data.sqlite");
const all = (s, p = []) => new Promise((res, rej) => db.all(s, p, (e, r) => (e ? rej(e) : res(r))));
const run = (s, p = []) => new Promise((res, rej) => db.run(s, p, function (e) { e ? rej(e) : res(this); }));

const cols = await all("PRAGMA table_info(product_metadata)");
if (!cols.some((c) => c.name === "factions")) {
  await run("ALTER TABLE product_metadata ADD COLUMN factions TEXT");
  console.log("added product_metadata.factions");
}

const rows = await all(`
  SELECT ps.product_id, ps.canonical_sku, m.game, m.faction, m.factions
  FROM product_skus ps JOIN product_metadata m ON m.product_id = ps.product_id`);

let changed = 0, none = 0, kept = 0;
for (const r of rows) {
  const byGame = bySku.get(r.canonical_sku);
  if (!byGame || byGame.size === 0) { none++; continue; }
  // primary faction: from the product's primary universe first, else any
  const primaryList = byGame.get(r.game) ?? [...byGame.values()][0];
  const primary = primaryList[0];
  // full list: primary universe's factions first, then the rest
  const allFactions = [...new Set([...(byGame.get(r.game) ?? []), ...[...byGame.values()].flat()])];
  const json = JSON.stringify(allFactions);
  if (primary === r.faction && json === r.factions) { kept++; continue; }
  changed++;
  if (APPLY) {
    await run(
      `UPDATE product_metadata SET faction = ?, factions = ?, updated_at = datetime('now') WHERE product_id = ?`,
      [primary, json, r.product_id],
    );
  }
}
console.log(`sku-mapped: ${rows.length} | faction updates: ${changed} | unchanged: ${kept} | no GW faction (kept curated): ${none}`);
console.log(APPLY ? "APPLIED" : "dry run — use --apply");
db.close();
