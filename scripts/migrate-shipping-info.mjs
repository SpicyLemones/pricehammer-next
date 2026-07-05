// scripts/migrate-shipping-info.mjs — seed sellers.shipping_info with both
// display text AND machine-readable delivery rules for cart totals:
//   flat: numeric flat rate (null = unknown/varies)
//   freeOver: order value at which delivery becomes free (null = never)
//   note: caveat worth surfacing (e.g. metro only)
import sqlite3 from "sqlite3";
const db = new sqlite3.Database("data/db/data.sqlite");
const run = (s,p=[]) => new Promise((res,rej)=>db.run(s,p,function(e){e?rej(e):res(this)}));
const all = (s) => new Promise((res,rej)=>db.all(s,(e,r)=>e?rej(e):res(r)));

const cols = await all("PRAGMA table_info(sellers)");
if (!cols.some(c=>c.name==="shipping_info")) {
  await run("ALTER TABLE sellers ADD COLUMN shipping_info TEXT");
}

const DEALS = {
  "War For Less": { tag: "Flat $12", deal: "Flat rate $12 shipping Australia-wide ($22 for bulky orders).", flat: 12, freeOver: null },
  "The Combat Company": { tag: "Free over $150*", deal: "Free shipping on orders over $150 (AU) or $250 (NZ) with code FREESHIP — or take 25% off GW RRP with code GW25 instead.", flat: null, freeOver: 150, note: "below $150 delivery is calculated at checkout" },
  "Gap Games": { tag: "Flat $10", deal: "Flat $10 delivery anywhere in Australia.", flat: 10, freeOver: null },
  "Gumnut": { tag: "Flat rate", deal: "Flat rate shipping Australia-wide on all online orders.", flat: null, freeOver: null, note: "flat rate, amount shown at checkout" },
  "Frontline Hobbies": { tag: "Free over $150*", deal: "Free shipping on orders over $150 (metro areas only).", flat: null, freeOver: 150, note: "metro areas only; otherwise calculated at checkout" },
  "Warhammer Official": { tag: null, deal: null, flat: null, freeOver: null, note: "delivery calculated at checkout" },
};
for (const [name, info] of Object.entries(DEALS)) {
  const r = await run("UPDATE sellers SET shipping_info = ? WHERE name = ?", [JSON.stringify(info), name]);
  console.log(`${name}: ${r.changes} row(s)`);
}
db.close();
