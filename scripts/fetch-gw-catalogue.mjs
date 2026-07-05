// scripts/fetch-gw-catalogue.mjs
//
// Pull the entire Games Workshop AU catalogue from the Algolia index that
// powers warhammer.com search (public search-only credentials, captured from
// the site itself). Massively faster + more reliable than page crawling.
//
// Output: scripts/analysis-output/gw-catalogue.json  [{name, slug, sku, price, productType}]
//
// Usage: node scripts/fetch-gw-catalogue.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "analysis-output");
const OUT_FILE = path.join(OUT_DIR, "gw-catalogue.json");

const APP_ID = "M5ZIQZNQ2H";
const API_KEY = "92c6a8254f9d34362df8e6d96475e5d8"; // public search-only key from warhammer.com
const INDEX = "prod-lazarus-product-en-au";
const URL = `https://${APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/${INDEX}/query`;

async function algolia(params) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "x-algolia-application-id": APP_ID,
      "x-algolia-api-key": API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`algolia http ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function pick(hit) {
  let image = null;
  if (Array.isArray(hit.images)) {
    const paths = hit.images.filter((v) => typeof v === "string");
    const still = paths.find((p) => p.includes("920x950")) ?? paths[0] ?? null;
    image = still ? `https://www.warhammer.com${still}` : null;
  }
  return {
    name: hit.name ?? null,
    slug: hit.slug ?? null,
    sku: hit.sku ?? null,
    price: hit.price ?? null,
    productType: hit.productType ?? null,
    image,
  };
}

async function main() {
  // 1) discover facet values for productType so each partition stays <1000 hits
  const probe = await algolia({ query: "", hitsPerPage: 0, facets: ["productType"] });
  const total = probe.nbHits;
  const types = Object.entries(probe.facets?.productType ?? {});
  console.log(`index total: ${total} products | productType partitions: ${types.length}`);

  const byKey = new Map();

  // Page through one filter expression; returns hits fetched, or -1 if the
  // partition exceeds the ~1000-hit pagination cap and must be split further.
  async function fetchPartition(filters) {
    const first = await algolia({ query: "", hitsPerPage: 500, page: 0, filters });
    if (first.nbHits > 1000) return -1;
    let got = 0;
    let pages = first.nbPages;
    const ingest = (r) => { for (const h of r.hits) { const item = pick(h); byKey.set(item.slug ?? item.sku ?? JSON.stringify(item), item); got++; } };
    ingest(first);
    for (let page = 1; page < pages; page++) {
      const r = await algolia({ query: "", hitsPerPage: 500, page, filters });
      ingest(r);
    }
    return got;
  }

  for (const [type] of types) {
    const base = `productType:"${type}"`;
    let got = await fetchPartition(base);
    if (got !== -1) { console.log(`  ${base} -> ${got}`); continue; }

    // too big: split by stock status, then by game system if still too big
    for (const stock of ["true", "false"]) {
      const f1 = `${base} AND isInStock:${stock}`;
      got = await fetchPartition(f1);
      if (got !== -1) { console.log(`  ${f1} -> ${got}`); continue; }

      const facetProbe = await algolia({ query: "", hitsPerPage: 0, filters: f1, facets: ["GameSystemsRoot.lvl0"] });
      const systems = Object.keys(facetProbe.facets?.["GameSystemsRoot.lvl0"] ?? {});
      console.log(`  ${f1} too big -> splitting across ${systems.length} game systems`);
      for (const sys of systems) {
        const f2 = `${f1} AND GameSystemsRoot.lvl0:"${sys.replace(/"/g, '\\"')}"`;
        const g2 = await fetchPartition(f2);
        console.log(`    ${sys} -> ${g2 === -1 ? "STILL TOO BIG (losing tail)" : g2}`);
      }
      // catch items with no game system facet: not directly filterable — rely on
      // the out-of-stock + other-type partitions to cover most; report coverage below.
    }
  }

  const all = [...byKey.values()];
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(all, null, 1));
  const withSku = all.filter((p) => p.sku).length;
  console.log(`\nDONE: ${all.length} unique products (${withSku} with SKU) -> ${path.relative(process.cwd(), OUT_FILE)}`);
}

main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
