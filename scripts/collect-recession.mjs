// scripts/collect-recession.mjs
//
// Feeds the Recession Indicator page. Run daily (or whenever).
//   node scripts/collect-recession.mjs
//
// Collects, politely:
//   - Seek job counts for tech (classification 6281) plus grad/junior/senior
//     keyword slices -> recession_series (one row per day per series)
//   - Reddit posting activity from job-misery subreddits via RSS (the .json
//     endpoints are blocked for unauthenticated callers, RSS is not)
//     -> recession_reddit_posts (one row per post, accumulates over time)
//   - Top + most controversial posts of the month per sub -> recession_fun_posts
//
// Reddit RSS is rate limited hard, so requests are spaced out and 429s get
// one slow retry. Total run is a couple of minutes.

import sqlite3 from "sqlite3";

const db = new sqlite3.Database("data/db/data.sqlite");
const run = (s, p = []) => new Promise((res, rej) => db.run(s, p, function (e) { e ? rej(e) : res(this); }));
const get = (s, p = []) => new Promise((res, rej) => db.get(s, p, (e, r) => (e ? rej(e) : res(r))));

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

// --- schema ---

await run(`CREATE TABLE IF NOT EXISTS recession_series (
  day TEXT NOT NULL,
  series TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (day, series)
)`);
await run(`CREATE TABLE IF NOT EXISTS recession_reddit_posts (
  sub TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_utc INTEGER NOT NULL,
  title TEXT,
  link TEXT,
  author TEXT,
  PRIMARY KEY (sub, post_id)
)`);
await run(`CREATE TABLE IF NOT EXISTS recession_fun_posts (
  sub TEXT NOT NULL,
  kind TEXT NOT NULL,
  rank INTEGER NOT NULL,
  title TEXT,
  link TEXT,
  author TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (sub, kind, rank)
)`);

// --- Seek counts ---
// classification 6281 = Information & Communication Technology

const SEEK_SERIES = [
  { series: "seek-ict-all", params: "classification=6281" },
  { series: "seek-ict-graduate", params: "classification=6281&keywords=graduate" },
  { series: "seek-ict-junior", params: "classification=6281&keywords=junior" },
  { series: "seek-ict-senior", params: "classification=6281&keywords=senior" },
  { series: "seek-ict-intern", params: "classification=6281&keywords=intern" },
  { series: "seek-all-graduate", params: "keywords=graduate" },
  // per-industry pages: healthcare 1211, education & training 6123, marketing 6008
  { series: "seek-nursing-all", params: "classification=1211" },
  { series: "seek-nursing-graduate", params: "classification=1211&keywords=graduate" },
  { series: "seek-education-all", params: "classification=6123" },
  { series: "seek-education-graduate", params: "classification=6123&keywords=graduate" },
  { series: "seek-childcare-all", params: "classification=6123&keywords=early+childhood" },
  { series: "seek-marketing-all", params: "classification=6008" },
  { series: "seek-marketing-graduate", params: "classification=6008&keywords=graduate" },
];

const seekOnly = process.argv.includes("--seek-only");

async function seekCount(params) {
  const url = `https://www.seek.com.au/api/jobsearch/v5/search?siteKey=AU-Main&where=All+Australia&pageSize=1&${params}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`seek ${res.status}`);
  const json = await res.json();
  const count = Number(json?.totalCount);
  if (!Number.isFinite(count)) throw new Error("seek: no totalCount");
  return count;
}

console.log("— Seek counts —");
for (const { series, params } of SEEK_SERIES) {
  try {
    const value = await seekCount(params);
    await run(
      `INSERT INTO recession_series (day, series, value) VALUES (?, ?, ?)
       ON CONFLICT(day, series) DO UPDATE SET value = excluded.value`,
      [today, series, value],
    );
    console.log(`  ${series}: ${value}`);
  } catch (e) {
    console.warn(`  ${series} FAILED: ${e.message}`);
  }
  await sleep(1200);
}

// --- Reddit via RSS ---

const SUBS = [
  { sub: "ausjobs", scope: "au" },
  { sub: "auscorp", scope: "au" },
  { sub: "cscareerquestions", scope: "global" },
  { sub: "csMajors", scope: "global" },
  { sub: "recruitinghell", scope: "global" },
  { sub: "ITCareerQuestions", scope: "global" },
];

async function fetchRss(url, attempt = 0) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/atom+xml,application/xml" } });
  if (res.status === 429 && attempt < 1) {
    console.warn(`  429 on ${url} — waiting 65s`);
    await sleep(65_000);
    return fetchRss(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`rss ${res.status}`);
  return res.text();
}

function parseEntries(xml) {
  const entries = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const block = m[1];
    const pick = (re) => (block.match(re) || [])[1] ?? null;
    const decode = (s) =>
      s == null ? null : s
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    entries.push({
      id: pick(/<id>(t3_[a-z0-9]+)<\/id>/),
      title: decode(pick(/<title>([\s\S]*?)<\/title>/)),
      link: pick(/<link href="([^"]+)"/),
      author: decode(pick(/<name>\/?u?\/?([^<]+)<\/name>/)),
      published: pick(/<published>([^<]+)<\/published>/) || pick(/<updated>([^<]+)<\/updated>/),
    });
  }
  return entries.filter((e) => e.id);
}

if (seekOnly) {
  console.log("Done (seek only).");
  db.close();
  process.exit(0);
}

console.log("— Reddit RSS —");
for (const { sub } of SUBS) {
  // recent posts, paged back as far as the listing allows
  let after = "";
  let stored = 0;
  try {
    for (let page = 0; page < 4; page++) {
      const url = `https://www.reddit.com/r/${sub}/new/.rss?limit=100${after ? `&after=${after}` : ""}`;
      const entries = parseEntries(await fetchRss(url));
      if (!entries.length) break;
      for (const e of entries) {
        const created = e.published ? Math.floor(Date.parse(e.published) / 1000) : null;
        if (!created) continue;
        const r = await run(
          `INSERT OR IGNORE INTO recession_reddit_posts (sub, post_id, created_utc, title, link, author)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [sub, e.id, created, e.title?.slice(0, 300) ?? null, e.link, e.author],
        );
        stored += r.changes ?? 0;
      }
      after = entries[entries.length - 1].id;
      await sleep(3500);
    }
    console.log(`  r/${sub}: +${stored} new posts`);
  } catch (e) {
    console.warn(`  r/${sub} listing FAILED: ${e.message}`);
  }

  // monthly top + controversial (feed order is the ranking; RSS carries no scores)
  for (const kind of ["top", "controversial"]) {
    try {
      const xml = await fetchRss(`https://www.reddit.com/r/${sub}/${kind}/.rss?t=month&limit=8`);
      const entries = parseEntries(xml).slice(0, 8);
      await run(`DELETE FROM recession_fun_posts WHERE sub = ? AND kind = ?`, [sub, kind]);
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        await run(
          `INSERT INTO recession_fun_posts (sub, kind, rank, title, link, author, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [sub, kind, i + 1, e.title?.slice(0, 300) ?? null, e.link, e.author, new Date().toISOString()],
        );
      }
      console.log(`  r/${sub} ${kind}: ${entries.length} posts`);
    } catch (e) {
      console.warn(`  r/${sub} ${kind} FAILED: ${e.message}`);
    }
    await sleep(3500);
  }
}

const totals = await get(`SELECT COUNT(*) AS posts FROM recession_reddit_posts`);
console.log(`Done. ${totals.posts} reddit posts tracked total.`);
db.close();
