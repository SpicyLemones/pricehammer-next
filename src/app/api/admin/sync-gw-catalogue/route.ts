// src/app/api/admin/sync-gw-catalogue/route.ts
//
// Sync our product catalogue against Games Workshop's own (via the public
// Algolia index behind warhammer.com). GW is the source of truth:
//   - GW item whose SKU we already track          -> known (skip)
//   - GW item matching an existing product's name -> link (attach SKU)
//   - GW item we don't have                       -> add product + metadata
//                                                    + SKU + seeded price pairs
//   - tracked SKU missing from GW's catalogue     -> reported as discontinued
//                                                    (not auto-hidden)
//
// Defaults are dryRun=true and scope games to what the site supports.
//
//   curl -u U:P -X POST "https://<host>/api/admin/sync-gw-catalogue"            # dry run
//   curl -u U:P -X POST "https://<host>/api/admin/sync-gw-catalogue?apply=1"    # write
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { isAuthorizedAdmin } from "@/lib/auth";
import { fetchGwCatalogueByGame, type GwCatalogueItem } from "@/app/lib/gw-algolia";
import { invalidateSkuCatalogueCache } from "@/app/lib/sku-catalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GAME_MAP: Record<string, string> = {
  "Warhammer 40,000": "warhammer40k",
  "Age of Sigmar": "ageofsigmar",
};
const DEFAULT_GAMES = Object.keys(GAME_MAP);
const DEFAULT_TYPES = ["miniatureKit", "boxedSet"];

const CATEGORY_BY_TYPE: Record<string, string> = {
  miniatureKit: "Generic Unit",
  boxedSet: "Boxed Set",
  book: "Codex/Battletome",
  rulebookCards: "Cards",
};

const normName = (s: string) =>
  s.toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export async function POST(req: Request) {
  if (!isAuthorizedAdmin(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const apply = ["1", "true"].includes((url.searchParams.get("apply") ?? "").toLowerCase());
  let games = DEFAULT_GAMES;
  let types = DEFAULT_TYPES;
  try {
    if ((req.headers.get("content-type") || "").includes("application/json")) {
      const body = (await req.json()) as { games?: string[]; types?: string[] };
      if (Array.isArray(body.games) && body.games.length) games = body.games;
      if (Array.isArray(body.types) && body.types.length) types = body.types;
    }
  } catch {}

  // 1) GW's current catalogue for the scoped games/types.
  // Models only: even within miniatureKit/boxedSet, skip paint/tool bundles.
  const NON_MODEL_NAME = /paint(s)? set|paints \+|\+ paints|tool(s)? set|\bbrush\b|\bdice\b/i;
  const gwItems = await fetchGwCatalogueByGame(games, types);
  const usable = gwItems.filter(
    (i): i is GwCatalogueItem & { normalizedSku: string; name: string } =>
      Boolean(i.normalizedSku && i.name && !NON_MODEL_NAME.test(i.name)),
  );

  // 2) what we already track
  const skuRows = (await query(
    "all",
    `SELECT product_id, canonical_sku, sku_aliases FROM product_skus`,
  )) as { product_id: number; canonical_sku: string | null; sku_aliases: string | null }[];
  const knownSkus = new Set<string>();
  for (const r of skuRows) {
    if (r.canonical_sku) knownSkus.add(r.canonical_sku);
    try {
      for (const a of JSON.parse(r.sku_aliases ?? "[]")) {
        if (typeof a === "string") {
          const tail = a.match(/(\d{5,})\s*$/);
          knownSkus.add(tail ? tail[1] : a);
        }
      }
    } catch {}
  }
  const productsWithSku = new Set(skuRows.map((r) => r.product_id));

  const products = (await query("all", `SELECT id, name FROM products`)) as {
    id: number;
    name: string;
  }[];
  const productByNormName = new Map<string, { id: number; name: string }>();
  for (const p of products) productByNormName.set(normName(p.name), p);

  const sellers = (await query("all", `SELECT id FROM sellers`)) as { id: number }[];

  // 3) classify GW items
  let known = 0;
  const toLink: { productId: number; item: GwCatalogueItem }[] = [];
  const toAdd: GwCatalogueItem[] = [];
  for (const item of usable) {
    if (knownSkus.has(item.normalizedSku)) {
      known++;
      continue;
    }
    const existing = productByNormName.get(normName(item.name));
    if (existing && !productsWithSku.has(existing.id)) {
      toLink.push({ productId: existing.id, item });
    } else if (!existing) {
      toAdd.push(item);
    } else {
      // name matches a product that already has a different SKU — likely an
      // edition refresh; treat as an alias candidate for manual review
      known++;
    }
  }

  // 3b) refresh new-release / pre-order flags for everything we track, so the
  // /new-releases page stays current with each weekly sync
  if (apply) {
    const productBySku = new Map<string, number>();
    for (const r of skuRows) {
      if (r.canonical_sku) productBySku.set(r.canonical_sku, r.product_id);
    }
    await query("run", `UPDATE product_metadata SET is_new_release = 0, is_pre_order = 0`);
    for (const item of usable) {
      const pid = productBySku.get(item.normalizedSku);
      if (!pid || (!item.isNewRelease && !item.isPreOrder)) continue;
      await query(
        "run",
        `UPDATE product_metadata SET is_new_release = ?, is_pre_order = ? WHERE product_id = ?`,
        [item.isNewRelease ? 1 : 0, item.isPreOrder ? 1 : 0, pid],
      );
    }
  }

  // 4) discontinued check: tracked SKUs (for in-scope games) missing from GW
  const gwSkuSet = new Set(usable.map((i) => i.normalizedSku));
  const inScopeGames = games.map((g) => GAME_MAP[g] ?? g);
  const trackedInScope = (await query(
    "all",
    `SELECT ps.product_id, ps.canonical_sku, p.name
     FROM product_skus ps
     JOIN products p ON p.id = ps.product_id
     JOIN product_metadata pm ON pm.product_id = ps.product_id
     WHERE pm.game IN (${inScopeGames.map(() => "?").join(",")})`,
    inScopeGames,
  )) as { product_id: number; canonical_sku: string | null; name: string }[];
  const discontinued = trackedInScope.filter(
    (r) => r.canonical_sku && !gwSkuSet.has(r.canonical_sku),
  );

  // 5) apply
  let linked = 0;
  let added = 0;
  if (apply) {
    for (const { productId, item } of toLink) {
      await query(
        "run",
        `INSERT INTO product_skus (product_id, canonical_sku, sku_aliases, name_aliases, source)
         VALUES (?, ?, ?, ?, 'gw-sync-name-link')
         ON CONFLICT(product_id) DO NOTHING`,
        [productId, item.normalizedSku, JSON.stringify(item.sku ? [item.sku] : []), JSON.stringify(item.name ? [item.name] : [])],
      );
      linked++;
    }

    for (const item of toAdd) {
      const res = (await query("run", "insert/product", [item.name, item.name])) as {
        lastID?: number;
      };
      const productId = Number(res?.lastID);
      if (!Number.isFinite(productId) || productId <= 0) continue;

      await query("run", "insert/product_metadata_seed", [
        productId,
        item.name,
        GAME_MAP[item.game ?? ""] ?? "warhammer40k",
        "", // faction: curated later
        CATEGORY_BY_TYPE[item.productType ?? ""] ?? "Misc",
        0,
        0,
        item.image ?? "",
      ]);

      await query(
        "run",
        `INSERT INTO product_skus (product_id, canonical_sku, sku_aliases, name_aliases, source)
         VALUES (?, ?, ?, ?, 'gw-sync-new')`,
        [productId, item.normalizedSku, JSON.stringify(item.sku ? [item.sku] : []), JSON.stringify([])],
      );

      for (const s of sellers) {
        await query("run", "insert/price", [s.id, productId]);
      }
      added++;
    }
    invalidateSkuCatalogueCache();
  }

  return NextResponse.json({
    ok: true,
    apply,
    scope: { games, types },
    gwItems: usable.length,
    known,
    wouldLink: toLink.length,
    wouldAdd: toAdd.length,
    linked,
    added,
    discontinued: discontinued.length,
    discontinuedSample: discontinued.slice(0, 25).map((d) => d.name),
    addSample: toAdd.slice(0, 40).map((i) => `${i.name} [${i.normalizedSku}] $${i.price}`),
    linkSample: toLink.slice(0, 25).map((l) => `${l.item.name} -> product ${l.productId}`),
  });
}
