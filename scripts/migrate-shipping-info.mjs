// scripts/migrate-shipping-info.mjs — add sellers.shipping_info and seed the
// researched delivery deals (JSON: { tag, deal }).
import sqlite3 from "sqlite3";
const db = new sqlite3.Database("data/db/data.sqlite");
const run = (s,p=[]) => new Promise((res,rej)=>db.run(s,p,function(e){e?rej(e):res(this)}));
const all = (s) => new Promise((res,rej)=>db.all(s,(e,r)=>e?rej(e):res(r)));

const cols = await all("PRAGMA table_info(sellers)");
if (!cols.some(c=>c.name==="shipping_info")) {
  await run("ALTER TABLE sellers ADD COLUMN shipping_info TEXT");
  console.log("added sellers.shipping_info");
}

const DEALS = {
  "War For Less": { tag: "Flat $12", deal: "Flat rate $12 shipping Australia-wide ($22 for bulky orders)." },
  "The Combat Company": { tag: "Free over $150*", deal: "Free shipping on orders over $150 (AU) or $250 (NZ) with code FREESHIP — or take 25% off GW RRP with code GW25 instead." },
  "Gap Games": { tag: "Flat $10", deal: "Flat $10 delivery anywhere in Australia." },
  "Gumnut": { tag: "Flat rate", deal: "Flat rate shipping Australia-wide on all online orders." },
  "Frontline Hobbies": { tag: "Free over $150*", deal: "Free shipping on orders over $150 (metro areas only)." },
};
for (const [name, info] of Object.entries(DEALS)) {
  const r = await run("UPDATE sellers SET shipping_info = ? WHERE name = ?", [JSON.stringify(info), name]);
  console.log(`${name}: ${r.changes} row(s) -> ${info.tag}`);
}
db.close();
