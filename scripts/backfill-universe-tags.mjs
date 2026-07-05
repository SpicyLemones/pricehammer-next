// scripts/backfill-universe-tags.mjs (v2)
// Tag products with ALL universes GW lists them under (games JSON array),
// plus a primary (game) where main systems outrank sub-games — a Dreadnought
// is warhammer40k first, killteam additionally; never "a Kill Team product".
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

// Some sub-game tags on GW's store are too loose for shopping purposes:
// "Nemesis Operatives" marks 40k kits merely USABLE as Kill Team mission
// bosses, and Warcry "Allies/Chaotic Beasts" are AoS units on loan. Only a
// qualifying lvl2 bucket makes a product genuinely OF that sub-game.
const SUB_GAME_QUALIFIERS = {
  "Kill Team": ["Choose a Kill Team", "Terrain - Killzones"],
  "Warcry": ["Warbands"],
};

function tagsFor(item) {
  const games = [];
  // main systems first, in priority order (first = primary)
  for (const [name, slug] of Object.entries(MAIN_GAMES)) {
    if ((item.gameLvl0 ?? []).includes(name)) games.push(slug);
  }
  // then sub-games (subject to qualifiers)
  for (const l of item.gameLvl1 ?? []) {
    const m = l.match(/^Other Games > (.+)$/);
    if (!m || !SUB_GAMES[m[1]] || games.includes(SUB_GAMES[m[1]])) continue;
    const quals = SUB_GAME_QUALIFIERS[m[1]];
    if (quals) {
      const ok = (item.gameLvl2 ?? []).some((p) =>
        quals.some((q) => p === `Other Games > ${m[1]} > ${q}`),
      );
      if (!ok) continue;
    }
    games.push(SUB_GAMES[m[1]]);
  }
  if (!games.length && (item.gameLvl0 ?? []).length) games.push("other");
  return games;
}

const bySku = new Map();
for (const g of gw) { const n = norm(g.sku); if (n) bySku.set(n, tagsFor(g)); }

const db = new sqlite3.Database("data/db/data.sqlite");
const all = (s, p = []) => new Promise((res, rej) => db.all(s, p, (e, r) => (e ? rej(e) : res(r))));
const run = (s, p = []) => new Promise((res, rej) => db.run(s, p, function (e) { e ? rej(e) : res(this); }));

const cols = await all("PRAGMA table_info(product_metadata)");
if (!cols.some((c) => c.name === "games")) {
  await run("ALTER TABLE product_metadata ADD COLUMN games TEXT");
  console.log("added product_metadata.games");
}

const rows = await all(`
  SELECT ps.product_id, ps.canonical_sku, m.game, m.games
  FROM product_skus ps JOIN product_metadata m ON m.product_id = ps.product_id`);

const primaryCounts = {}; const multi = {}; let changed = 0, unknown = 0;
for (const r of rows) {
  const tags = bySku.get(r.canonical_sku);
  if (!tags || !tags.length) { unknown++; continue; }
  const primary = tags[0];
  const gamesJson = JSON.stringify(tags);
  primaryCounts[primary] = (primaryCounts[primary] || 0) + 1;
  if (tags.length > 1) multi[tags.join("+")] = (multi[tags.join("+")] || 0) + 1;
  if (primary !== r.game || gamesJson !== r.games) {
    changed++;
    if (APPLY) {
      await run(
        `UPDATE product_metadata SET game = ?, games = ?, updated_at = datetime('now') WHERE product_id = ?`,
        [primary, gamesJson, r.product_id],
      );
    }
  }
}
console.log("primary counts:", JSON.stringify(primaryCounts));
console.log("multi-tag combos (top):", Object.entries(multi).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`${k}:${v}`).join("  "));
console.log(`sku-mapped: ${rows.length} | changed: ${changed} | not in catalogue: ${unknown}`);
console.log(APPLY ? "APPLIED" : "dry run — use --apply");
db.close();
