// scripts/push-prices.mjs
// Push locally-refreshed prices to a deployment, non-destructively.
//   node scripts/push-prices.mjs https://www.spycy.fun
// Sends current validated prices plus the last 7 days of price history.
// Credentials come from ADMIN_USER / ADMIN_PASS env vars, falling back to
// .env.local.
import sqlite3 from "sqlite3";
import { readFileSync } from "node:fs";

const base = (process.argv[2] || "https://www.spycy.fun").replace(/\/$/, "");

function envLocal(key) {
  try {
    const m = readFileSync(".env.local", "utf8").match(new RegExp(`^${key}=(.+)$`, "m"));
    return m ? m[1].trim().split(/\s+#/)[0].trim() : undefined;
  } catch {
    return undefined;
  }
}
const user = process.env.ADMIN_USER || envLocal("ADMIN_USER");
const pass = process.env.ADMIN_PASS || envLocal("ADMIN_PASS");
if (!user || !pass) {
  console.error("Set ADMIN_USER and ADMIN_PASS (env or .env.local)");
  process.exit(1);
}

const db = new sqlite3.Database("data/db/data.sqlite");
const all = (s) => new Promise((res, rej) => db.all(s, (e, r) => (e ? rej(e) : res(r))));

const prices = await all(
  "SELECT seller_id, product_id, price, link FROM prices WHERE validated IS NOT NULL AND price IS NOT NULL",
);
const history = await all(
  "SELECT seller_id, product_id, price, link, recorded_at FROM price_history WHERE recorded_at >= datetime('now', '-7 days')",
);
db.close();

console.log(`pushing ${prices.length} current prices, ${history.length} history rows (last 7 days) to ${base}`);

// chunk so no single request gets big enough to bother anyone
const CHUNK = 2000;
let totals = { prices: 0, history: 0 };
async function send(body) {
  const res = await fetch(`${base}/api/admin/prices-import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
  const j = JSON.parse(text);
  totals.prices += j.prices ?? 0;
  totals.history += j.history ?? 0;
  console.log(`  ${res.status} prices=${j.prices} history=${j.history}`);
}

for (let i = 0; i < prices.length; i += CHUNK) {
  await send({ prices: prices.slice(i, i + CHUNK) });
}
for (let i = 0; i < history.length; i += CHUNK) {
  await send({ history: history.slice(i, i + CHUNK) });
}
console.log(`done: ${totals.prices} prices updated, ${totals.history} history rows inserted`);
