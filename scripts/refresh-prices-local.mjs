// scripts/refresh-prices-local.mjs
// Run the full price refresh against the LOCAL dev server (which does the
// scraping from this machine), then push the results to prod.
//   npm run refresh:prices            (refresh + push to spycy.fun)
//   node scripts/refresh-prices-local.mjs --no-push   (refresh only)
// Needs `npm run dev` running on localhost:3000 and ADMIN_USER / ADMIN_PASS
// in .env.local.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const LOCAL = "http://localhost:3000";
const noPush = process.argv.includes("--no-push");

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
const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

// dev server up?
try {
  await fetch(`${LOCAL}/api/sellers`, { signal: AbortSignal.timeout(10_000) });
} catch {
  console.error(`No dev server on ${LOCAL}. Start it first: npm run dev`);
  process.exit(1);
}

console.log("starting full refresh on the local server...");
const start = await fetch(`${LOCAL}/api/refresh-prices`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: auth },
  body: JSON.stringify({ async: true }),
});
const s = await start.json();
if (!s.ok || !s.jobId) {
  console.error("could not start refresh:", JSON.stringify(s));
  process.exit(1);
}
console.log(`job ${s.jobId} running; polling every 30s`);

const t0 = Date.now();
for (;;) {
  await new Promise((r) => setTimeout(r, 30_000));
  let job;
  try {
    const res = await fetch(`${LOCAL}/api/refresh-prices?job=${s.jobId}`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(45_000),
    });
    job = (await res.json()).job;
  } catch {
    console.log("  poll hiccup (server busy scraping), still going");
    continue;
  }
  if (!job) {
    console.error("job vanished (dev server restarted?). Run again.");
    process.exit(1);
  }
  const mins = Math.round((Date.now() - t0) / 60_000);
  if (job.status === "running") {
    console.log(`  running, ${mins}min elapsed`);
    continue;
  }
  if (job.status === "failed") {
    console.error("refresh failed:", job.error);
    process.exit(1);
  }
  console.log(`refresh done in ${mins}min:`, JSON.stringify(job.result));
  break;
}

if (noPush) {
  console.log("--no-push set, stopping here. Push later with: node scripts/push-prices.mjs");
  process.exit(0);
}

console.log("pushing to prod...");
const push = spawnSync(process.execPath, ["scripts/push-prices.mjs"], { stdio: "inherit" });
process.exit(push.status ?? 0);
