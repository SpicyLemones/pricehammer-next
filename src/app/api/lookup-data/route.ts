export const dynamic = "force-dynamic";
export const revalidate = 0;

import { gzipSync } from "zlib";
import { NextResponse } from "next/server";
import { catalogueVersion, query } from "@/lib/sql";
import { fetchAllProductMetadata } from "@/app/lib/product-metadata";

// Types to keep things clear
type DBPriceRow = {
  seller_name: string;
  shipping_info: string | null;
  price: number | null;
  link: string | null;
};
type APIShipping = {
  tag?: string | null;
  deal?: string | null;
  flat?: number | null;
  freeOver?: number | null;
  note?: string | null;
};
type APIRetailer = {
  store: string;
  price: number | null;
  url: string | null;
  shipping?: APIShipping;
};

function parseShipping(raw: string | null): APIShipping | undefined {
  if (!raw) return undefined;
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === "object") {
      return {
        tag: typeof j.tag === "string" ? j.tag : null,
        deal: typeof j.deal === "string" ? j.deal : null,
        flat: typeof j.flat === "number" ? j.flat : null,
        freeOver: typeof j.freeOver === "number" ? j.freeOver : null,
        note: typeof j.note === "string" ? j.note : null,
      };
    }
  } catch {}
  return undefined;
}
type APIProduct = {
  id: string;
  name: string;
  game?: string;
  games?: string[];
  faction?: string;
  factions?: string[];
  image?: string | null;
  hidden?: boolean;
  retailers: APIRetailer[];
};

// Warhammer Official's price is the RRP. Third-party prices meaningfully
// ABOVE it (ceiling, 3% tolerance) or absurdly BELOW it (floor: less than
// half RRP — deeper than any normal AU discount) are almost always wrong
// links or stale data, so they are hidden from display.
const RRP_CEILING = 1.03;
const RRP_FLOOR = 0.5;

function filterSuspiciousPrices(rows: DBPriceRow[]): DBPriceRow[] {
  const gw = rows.find((r) => /warhammer/i.test(r.seller_name));
  const rrp = gw?.price;
  if (rrp == null || !Number.isFinite(rrp) || rrp <= 0) return rows;
  return rows.filter(
    (r) =>
      r === gw ||
      r.price == null ||
      (r.price <= rrp * RRP_CEILING && r.price >= rrp * RRP_FLOOR),
  );
}

// All displayable prices in ONE query (was one query per product — ~1,500
// full-table scans per page view). Same filters as select/display_prices.
const ALL_DISPLAY_PRICES_SQL = `
  SELECT prices.product_id AS product_id,
         sellers.name AS seller_name,
         sellers.shipping_info AS shipping_info,
         prices.price AS price,
         prices.link AS link
  FROM prices
  JOIN sellers ON prices.seller_id = sellers.id
  WHERE prices.validated = 1
    AND COALESCE(sellers.status, 'active') NOT IN ('dead', 'retired')
  ORDER BY prices.product_id, sellers.id`;

// The serialized response, cached until the catalogue changes. Any write to
// prices/products/sellers/metadata bumps catalogueVersion() (see sql.ts), so
// this never serves stale data — it just stops recomputing identical JSON
// for every visitor.
type Cached = { version: number; body: string; gzipped: Buffer };
const g = globalThis as unknown as { __phLookupCache?: Cached; __phLookupBuild?: Promise<Cached> };

async function buildBody(version: number): Promise<Cached> {
  const [metadataRows, priceRows] = await Promise.all([
    fetchAllProductMetadata(),
    query("all", ALL_DISPLAY_PRICES_SQL) as Promise<(DBPriceRow & { product_id: number })[]>,
  ]);

  const pricesByProduct = new Map<number, DBPriceRow[]>();
  for (const row of priceRows) {
    const pid = Number(row.product_id);
    let list = pricesByProduct.get(pid);
    if (!list) pricesByProduct.set(pid, (list = []));
    list.push(row);
  }

  const products: APIProduct[] = [];
  for (const meta of metadataRows) {
    const idNum = Number(meta.productId);
    if (!Number.isFinite(idNum)) continue;
    if (meta.hidden) continue;
    const prices = pricesByProduct.get(idNum) ?? [];

    products.push({
      id: String(meta.productId),
      name: meta.displayName,
      game: meta.game ?? undefined,
      games: meta.games.length ? meta.games : undefined,
      faction: meta.faction ?? undefined,
      factions: meta.factions.length ? meta.factions : undefined,
      image: meta.image,
      hidden: meta.hidden,
      retailers: filterSuspiciousPrices(prices).map((r) => ({
        store: r.seller_name,
        price: r.price,
        url: r.link,
        shipping: parseShipping(r.shipping_info),
      })),
    });
  }

  // ~3MB of JSON that is mostly repeated store/shipping strings: compress it
  // once per catalogue change (≈10x smaller) instead of per request
  const body = JSON.stringify({ products });
  return { version, body, gzipped: gzipSync(body) };
}

export async function GET(req: Request) {
  const version = catalogueVersion();
  let cached = g.__phLookupCache;
  if (!cached || cached.version !== version) {
    // de-dupe concurrent rebuilds: a burst of visitors shares one build
    if (!g.__phLookupBuild) {
      g.__phLookupBuild = buildBody(version).finally(() => {
        g.__phLookupBuild = undefined;
      });
    }
    cached = await g.__phLookupBuild;
    // only keep it if nothing was written while we were building
    if (cached.version === catalogueVersion()) g.__phLookupCache = cached;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    // server-side cache handles freshness; browsers always revalidate
    "Cache-Control": "no-store",
    Vary: "Accept-Encoding",
  };
  if (/\bgzip\b/.test(req.headers.get("accept-encoding") ?? "")) {
    headers["Content-Encoding"] = "gzip";
    return new NextResponse(new Uint8Array(cached.gzipped), { headers });
  }
  return new NextResponse(cached.body, { headers });
}
