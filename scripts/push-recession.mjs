// scripts/push-recession.mjs
// Push the local recession tables to a deployment, non-destructively.
//   node scripts/push-recession.mjs https://www.spycy.fun
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

const payload = {
  series: await all("SELECT day, series, value FROM recession_series"),
  posts: await all("SELECT sub, post_id, created_utc, title, link, author FROM recession_reddit_posts"),
  funPosts: await all("SELECT sub, kind, rank, title, link, author, fetched_at FROM recession_fun_posts"),
};
db.close();

console.log(`pushing ${payload.series.length} series rows, ${payload.posts.length} posts, ${payload.funPosts.length} fun posts to ${base}`);

const res = await fetch(`${base}/api/admin/recession-import`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
  },
  body: JSON.stringify(payload),
});
console.log(res.status, await res.text());
