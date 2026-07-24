// scripts/purge-price-outliers.mjs
// Find validated prices that disagree wildly with the other sellers on the
// same product (under 45% or over 220% of the median, needing 3+ sellers),
// demote them to validated=0 locally, and push the same demotions to prod.
//   node scripts/purge-price-outliers.mjs                 (local + push)
//   node scripts/purge-price-outliers.mjs --dry           (report only)
//   node scripts/purge-price-outliers.mjs --no-push       (local only)
import sqlite3 from "sqlite3";
import { readFileSync } from "node:fs";

const dry = process.argv.includes("--dry");
const noPush = process.argv.includes("--no-push");
const base = "https://www.spycy.fun";

const db = new sqlite3.Database("data/db/data.sqlite");
const all = (s, p) => new Promise((res, rej) => db.all(s, p ?? [], (e, r) => (e ? rej(e) : res(r))));
const run = (s, p) => new Promise((res, rej) => db.run(s, p ?? [], function (e) { e ? rej(e) : res(this.changes); }));

const products = await all(`
  SELECT product_id, COUNT(*) n FROM prices
  WHERE validated = 1 AND price > 0
  GROUP BY product_id HAVING n >= 3`);

const sellers = Object.fromEntries((await all("SELECT id, name FROM sellers")).map((s) => [s.id, s.name]));
const names = Object.fromEntries((await all("SELECT id, name FROM products")).map((p) => [p.id, p.name]));

const outliers = [];
for (const r of products) {
  const ps = await all(
    "SELECT seller_id, price FROM prices WHERE product_id = ? AND validated = 1 AND price > 0",
    [r.product_id],
  );
  const sorted = ps.map((x) => x.price).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  for (const p of ps) {
    if (p.price < median * 0.45 || p.price > median * 2.2) {
      outliers.push({ seller_id: p.seller_id, product_id: r.product_id, price: p.price, median });
    }
  }
}

console.log(`${outliers.length} outlier pairs across ${new Set(outliers.map((o) => o.product_id)).size} products:`);
for (const o of outliers) {
  console.log(`  ${(sellers[o.seller_id] ?? o.seller_id).padEnd(20)} ${String(names[o.product_id] ?? o.product_id).slice(0, 45).padEnd(45)} $${o.price} vs median $${o.median}`);
}

if (dry) {
  db.close();
  process.exit(0);
}

let local = 0;
for (const o of outliers) {
  local += await run(
    "UPDATE prices SET validated = 0 WHERE seller_id = ? AND product_id = ? AND validated = 1",
    [o.seller_id, o.product_id],
  );
}
db.close();
console.log(`demoted ${local} pairs locally`);

if (noPush) process.exit(0);

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
  console.error("No ADMIN_USER/ADMIN_PASS; skipping prod push. Run again after setting them.");
  process.exit(1);
}
// prod computes outliers from its own data (its catalogue can be ahead of
// the local copy), so just trigger the server-side purge
const res = await fetch(`${base}/api/admin/purge-price-outliers?apply=1`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
  },
});
console.log("prod:", res.status, (await res.text()).slice(0, 300));
