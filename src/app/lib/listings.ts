// src/app/lib/listings.ts
//
// Store listings: each store's catalogue, saved locally, and the automatic
// matching that runs on top of it.
//
//   syncSellerListings(seller)  fetch the store's feed page by page, match
//                               every item against our catalogue, and save
//                               the Warhammer-relevant listings + their top
//                               product candidates. Network + CPU, but
//                               constant memory.
//   reconcileSeller(sellerId)   pure DB: decide every price pair for that
//                               store from the saved listings — accept,
//                               mark not stocked, refresh prices, notice
//                               removed or changed listings — and leave only
//                               genuinely ambiguous pairs for /tinder.
//
// Decision provenance lives on prices.decided_by:
//   NULL    never decided            -> full automatic rules
//   'auto'  decided by reconcile     -> full automatic rules (can revive)
//   'human' decided in /tinder       -> never overridden, except a confirmed
//                                       link the store removed, or an exact
//                                       SKU match reviving a "not stocked"
//   'flag'  sent to review by a rule (report, outlier, SKU contradiction)
//                                    -> left strictly for a human

import { query } from "@/lib/sql";
import { normalizeShopifySku, fetchShopifyProductFeed, type ShopifyFeedProduct } from "@/app/lib/shopify";
import {
  buildShopifyProductUrl,
  matchShopifyProductsAgainstCatalogue,
} from "@/app/lib/shopify-catalogue";
import { fetchWooCommerceProductFeed } from "@/app/lib/woocommerce";
import { fetchGwCatalogue } from "@/app/lib/gw-algolia";
import {
  ensureSkuForProducts,
  normalizeProductUrl,
  parseSellerStorefront,
} from "@/app/lib/storefronts";

/* ------------------------------------------------------------------ */
/* thresholds                                                          */
/* ------------------------------------------------------------------ */

/** Name confidence needed to accept without a SKU. */
export const ACCEPT_CONFIDENCE = 0.85;
/** Rank-1 must beat the runner-up for the same listing by this much... */
const CLEAR_LEAD = 0.05;
/** ...or be this much closer as a whole name (contained-name ties). */
const CLEAR_EXACTNESS_LEAD = 0.1;
/** A sync older than this can't be used to conclude "not stocked"/"removed". */
const FRESH_SYNC_MS = 8 * 24 * 60 * 60 * 1000;
/** Candidates kept per listing. */
const MAX_CANDIDATES = 3;

/* ------------------------------------------------------------------ */
/* schema                                                              */
/* ------------------------------------------------------------------ */

let schemaReady: Promise<void> | null = null;

export function ensureListingsSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await query(
      "run",
      `CREATE TABLE IF NOT EXISTS store_listings (
         seller_id INTEGER NOT NULL,
         url_key TEXT NOT NULL,
         url TEXT NOT NULL,
         title TEXT NOT NULL,
         sku TEXT,
         price REAL,
         compare_at_price REAL,
         available INTEGER,
         image TEXT,
         product_type TEXT,
         vendor TEXT,
         first_seen TEXT NOT NULL,
         last_seen TEXT NOT NULL,
         PRIMARY KEY (seller_id, url_key)
       )`,
    );
    await query(
      "run",
      `CREATE TABLE IF NOT EXISTS listing_matches (
         seller_id INTEGER NOT NULL,
         url_key TEXT NOT NULL,
         product_id INTEGER NOT NULL,
         rank INTEGER NOT NULL,
         reason TEXT NOT NULL,
         confidence REAL NOT NULL,
         exactness REAL,
         PRIMARY KEY (seller_id, url_key, product_id)
       )`,
    );
    await query(
      "run",
      `CREATE INDEX IF NOT EXISTS idx_listing_matches_product
         ON listing_matches(seller_id, product_id)`,
    );
    await query(
      "run",
      `CREATE TABLE IF NOT EXISTS store_syncs (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         seller_id INTEGER NOT NULL,
         started_at TEXT NOT NULL,
         finished_at TEXT,
         ok INTEGER NOT NULL DEFAULT 0,
         complete INTEGER NOT NULL DEFAULT 0,
         feed_items INTEGER,
         listings INTEGER,
         error TEXT
       )`,
    );
    await query("run", `CREATE INDEX IF NOT EXISTS idx_store_syncs_seller ON store_syncs(seller_id, id)`);
    // prices.review_reason / decided_by / checked_at are added at DB open
    // (sql.ts STARTUP_STATEMENTS) so every query can rely on them
  })().catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

/* ------------------------------------------------------------------ */
/* tiny transaction mutex                                              */
/* ------------------------------------------------------------------ */
// All queries share one SQLite connection, so two overlapping BEGINs from
// concurrent jobs would collide. Serialize this module's transactions.

let txChain: Promise<unknown> = Promise.resolve();

function inTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const next = txChain.then(async () => {
    await query("run", "BEGIN");
    try {
      const out = await fn();
      await query("run", "COMMIT");
      return out;
    } catch (e) {
      await query("run", "ROLLBACK").catch(() => {});
      throw e;
    }
  });
  txChain = next.catch(() => {});
  return next;
}

/* ------------------------------------------------------------------ */
/* sync                                                                */
/* ------------------------------------------------------------------ */

type SellerRow = {
  id: number;
  name?: string | null;
  base_url?: string | null;
  storefront?: unknown;
  status?: string | null;
};

export type SyncResult = {
  sellerId: number;
  seller: string;
  ok: boolean;
  skipped?: string;
  complete: boolean;
  feedItems: number;
  listings: number;
  removed: number;
  ms: number;
  error?: string;
};

const GW_SHOP_BASE = "https://www.warhammer.com/en-AU/shop/";

/** Every link this seller's price pairs point at, so those listings are
 *  always saved (and their prices tracked) even if the matcher no longer
 *  ranks them. */
async function pairLinkKeys(sellerId: number): Promise<Set<string>> {
  const rows = (await query(
    "all",
    `SELECT link FROM prices WHERE seller_id = ? AND link IS NOT NULL AND link != ''`,
    [sellerId],
  )) as { link: string }[];
  const keys = new Set<string>();
  for (const r of rows) {
    const k = normalizeProductUrl(r.link);
    if (k) keys.add(k);
  }
  return keys;
}

function pickVariant(p: ShopifyFeedProduct) {
  const vs = p.variants ?? [];
  return vs.find((v) => v.available && v.price != null) ?? vs.find((v) => v.price != null) ?? vs[0] ?? null;
}

export async function syncSellerListings(seller: SellerRow): Promise<SyncResult> {
  await ensureListingsSchema();
  const t0 = Date.now();
  const sellerId = Number(seller.id);
  const label = `${seller.name ?? "Seller"}#${sellerId}`;
  const config = parseSellerStorefront(seller.storefront);
  const base: SyncResult = { sellerId, seller: label, ok: false, complete: false, feedItems: 0, listings: 0, removed: 0, ms: 0 };

  if (!config || config.platform === "misc") {
    return { ...base, ok: true, skipped: "no product API (manual store)", ms: Date.now() - t0 };
  }
  const baseUrl = String(seller.base_url ?? "");
  const runAt = new Date().toISOString();
  const syncRow = (await query(
    "run",
    `INSERT INTO store_syncs (seller_id, started_at) VALUES (?, ?)`,
    [sellerId, runAt],
  )) as { lastID?: number };
  const syncId = Number(syncRow?.lastID);

  const linkKeys = await pairLinkKeys(sellerId);
  let feedItems = 0;
  let saved = 0;

  const handlePage = async (page: ShopifyFeedProduct[]) => {
    feedItems += page.length;
    if (config.matchStrategy === "sku-from-page" && config.platform === "shopify") {
      await ensureSkuForProducts(page, baseUrl, fetch);
    }
    const summary = await matchShopifyProductsAgainstCatalogue(page, {
      baseUrl,
      maxFuzzyCandidates: MAX_CANDIDATES,
    });

    const rows: { key: string; p: ShopifyFeedProduct; url: string }[] = [];
    const matchRows: { key: string; c: (typeof summary.products)[number]["candidates"] }[] = [];
    summary.products.forEach((result, i) => {
      const p = page[i];
      const url = p.productUrl ?? buildShopifyProductUrl(baseUrl, p.handle) ?? null;
      const key = normalizeProductUrl(url);
      if (!url || !key) return;
      // keep Warhammer-relevant items (any candidate) + anything a pair links to
      if (!result.candidates.length && !linkKeys.has(key)) return;
      rows.push({ key, p, url });
      matchRows.push({ key, c: result.candidates.slice(0, MAX_CANDIDATES) });
    });
    if (!rows.length) return;

    await inTransaction(async () => {
      for (const { key, p, url } of rows) {
        const v = pickVariant(p);
        const sku = p.variants.map((x) => x.normalizedSku ?? normalizeShopifySku(x.sku)).find(Boolean) ?? null;
        await query(
          "run",
          `INSERT INTO store_listings (seller_id, url_key, url, title, sku, price, compare_at_price,
                                       available, image, product_type, vendor, first_seen, last_seen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(seller_id, url_key) DO UPDATE SET
             url = excluded.url, title = excluded.title, sku = excluded.sku,
             price = excluded.price, compare_at_price = excluded.compare_at_price,
             available = excluded.available, image = excluded.image,
             product_type = excluded.product_type, vendor = excluded.vendor,
             last_seen = excluded.last_seen`,
          [
            sellerId, key, url, p.title, sku, v?.price ?? null, v?.compareAtPrice ?? null,
            p.variants.some((x) => x.available) ? 1 : 0, p.image ?? null,
            p.productType ?? null, p.vendor ?? null, runAt, runAt,
          ],
        );
      }
      for (const { key, c } of matchRows) {
        await query("run", `DELETE FROM listing_matches WHERE seller_id = ? AND url_key = ?`, [sellerId, key]);
        let rank = 0;
        for (const cand of c) {
          rank++;
          await query(
            "run",
            `INSERT OR REPLACE INTO listing_matches
               (seller_id, url_key, product_id, rank, reason, confidence, exactness)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [sellerId, key, Number(cand.canonicalProductId), rank, cand.reason, cand.confidence, cand.exactness ?? null],
          );
        }
      }
    });
    saved += rows.length;
  };

  let ok = false;
  let complete = false;
  let error: string | undefined;
  try {
    if (config.platform === "shopify") {
      const r = await fetchShopifyProductFeed(baseUrl, { maxPages: config.maxFeedPages, onPage: handlePage });
      ok = r.ok;
      complete = r.ok && r.complete;
      if (!r.ok) error = r.error;
    } else if (config.platform === "woocommerce") {
      const r = await fetchWooCommerceProductFeed(baseUrl, { maxPages: config.maxFeedPages, onPage: handlePage });
      ok = r.ok;
      complete = r.ok && r.complete;
      if (!r.ok) error = r.error;
    } else if (config.platform === "gw-algolia") {
      const items = await fetchGwCatalogue();
      const asFeed: ShopifyFeedProduct[] = items
        .filter((it) => it.slug && it.name)
        .map((it) => ({
          id: it.slug!,
          handle: it.slug!,
          title: it.name!,
          productType: it.productType ?? undefined,
          vendor: "Games Workshop",
          variants: [{
            id: it.slug!, title: it.name!, sku: it.sku, normalizedSku: it.normalizedSku,
            price: it.price, compareAtPrice: null, available: true,
          }],
          image: it.image,
          productUrl: `${GW_SHOP_BASE}${it.slug}`,
        }));
      for (let i = 0; i < asFeed.length; i += 250) await handlePage(asFeed.slice(i, i + 250));
      ok = true;
      complete = items.length > 0;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // A complete walk is authoritative: anything not seen this run is gone.
  // After a partial walk we keep old rows (but drop month-stale ones).
  let removed = 0;
  if (ok) {
    const cutoff = complete ? runAt : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    removed = await inTransaction(async () => {
      const r = (await query(
        "run",
        `DELETE FROM store_listings WHERE seller_id = ? AND last_seen < ?`,
        [sellerId, cutoff],
      )) as { changes?: number };
      await query(
        "run",
        `DELETE FROM listing_matches WHERE seller_id = ? AND url_key NOT IN
           (SELECT url_key FROM store_listings WHERE seller_id = ?)`,
        [sellerId, sellerId],
      );
      return r?.changes ?? 0;
    });
  }

  await query(
    "run",
    `UPDATE store_syncs SET finished_at = ?, ok = ?, complete = ?, feed_items = ?, listings = ?, error = ?
     WHERE id = ?`,
    [new Date().toISOString(), ok ? 1 : 0, complete ? 1 : 0, feedItems, saved, error ?? null, syncId],
  );
  // keep the sync log short
  await query(
    "run",
    `DELETE FROM store_syncs WHERE seller_id = ? AND id NOT IN
       (SELECT id FROM store_syncs WHERE seller_id = ? ORDER BY id DESC LIMIT 20)`,
    [sellerId, sellerId],
  );

  const res: SyncResult = { ...base, ok, complete, feedItems, listings: saved, removed, ms: Date.now() - t0, error };
  console.log(
    `[listings] SYNC ${label}: ok=${ok} complete=${complete} feed=${feedItems} saved=${saved} removed=${removed} ${res.ms}ms${error ? ` error=${error}` : ""}`,
  );
  return res;
}

/* ------------------------------------------------------------------ */
/* reconcile                                                           */
/* ------------------------------------------------------------------ */

type PairRow = {
  seller_id: number;
  product_id: number;
  price: number | null;
  link: string | null;
  validated: number | null;
  decided_by: string | null;
  review_reason: string | null;
};

type MatchRow = {
  url_key: string;
  product_id: number;
  rank: number;
  reason: "sku" | "fuzzy-name";
  confidence: number;
  exactness: number | null;
  url: string;
  title: string;
  sku: string | null;
  price: number | null;
  available: number | null;
};

type ListingRow = { url_key: string; url: string; title: string; sku: string | null; price: number | null };

export type ReconcileResult = {
  sellerId: number;
  skipped?: string;
  dryRun: boolean;
  authoritative: boolean;
  accepted: number;
  revived: number;
  priceUpdates: number;
  relinked: number;
  notStocked: number;
  removedByStore: number;
  flagged: number;
  needsReview: number;
  unchanged: number;
  /** set when the mass-removal safety brake fired */
  removalBrake?: string;
  sample: Record<string, unknown>[];
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const sanePrice = (n: number | null): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0.5 && n <= 5000;

/** Strong = safe to accept automatically. */
function isStrong(best: MatchRow, runnerUp: MatchRow | undefined): boolean {
  if (best.rank !== 1) return false;
  if (best.reason === "sku") return true;
  if (best.confidence < ACCEPT_CONFIDENCE) return false;
  if (!runnerUp) return true;
  return (
    best.confidence - runnerUp.confidence >= CLEAR_LEAD ||
    (best.exactness ?? 0) - (runnerUp.exactness ?? 0) >= CLEAR_EXACTNESS_LEAD
  );
}

const rankKey = (m: MatchRow) =>
  (m.reason === "sku" ? 100 : 0) + m.confidence + (m.exactness ?? 0) * 0.01 +
  (m.available ? 0.001 : 0) + (m.price != null ? 0.0005 : 0);

export async function reconcileSeller(
  sellerId: number,
  opts: { dryRun?: boolean } = {},
): Promise<ReconcileResult> {
  await ensureListingsSchema();
  const dryRun = !!opts.dryRun;
  const out: ReconcileResult = {
    sellerId, dryRun, authoritative: false, accepted: 0, revived: 0, priceUpdates: 0, relinked: 0,
    notStocked: 0, removedByStore: 0, flagged: 0, needsReview: 0, unchanged: 0, sample: [],
  };

  const lastSync = (await query(
    "get",
    `SELECT finished_at, complete FROM store_syncs WHERE seller_id = ? AND ok = 1 ORDER BY id DESC LIMIT 1`,
    [sellerId],
  )) as { finished_at: string | null; complete: number } | undefined;
  if (!lastSync?.finished_at) return { ...out, skipped: "store has never been synced" };
  // only a recent, complete walk can prove absence ("not stocked"/"removed")
  out.authoritative =
    lastSync.complete === 1 && Date.now() - Date.parse(lastSync.finished_at) < FRESH_SYNC_MS;

  const [pairs, matches, listings, skuRows, productRows] = await Promise.all([
    query(
      "all",
      `SELECT seller_id, product_id, price, link, validated, decided_by, review_reason
       FROM prices WHERE seller_id = ?`,
      [sellerId],
    ) as Promise<PairRow[]>,
    query(
      "all",
      `SELECT m.url_key, m.product_id, m.rank, m.reason, m.confidence, m.exactness,
              l.url, l.title, l.sku, l.price, l.available
       FROM listing_matches m
       JOIN store_listings l ON l.seller_id = m.seller_id AND l.url_key = m.url_key
       WHERE m.seller_id = ?`,
      [sellerId],
    ) as Promise<MatchRow[]>,
    query(
      "all",
      `SELECT url_key, url, title, sku, price FROM store_listings WHERE seller_id = ?`,
      [sellerId],
    ) as Promise<ListingRow[]>,
    query("all", `SELECT product_id, canonical_sku, sku_aliases FROM product_skus`) as Promise<
      { product_id: number; canonical_sku: string | null; sku_aliases: string | null }[]
    >,
    query("all", `SELECT id, name FROM products`) as Promise<{ id: number; name: string }[]>,
  ]);

  // The catalogue lists some products twice under the same name (one per
  // faction). Those are the same physical item: treat them as equivalent so
  // they don't block each other as "too close to call".
  const nameKey = (n: string) => n.toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const productName = new Map(productRows.map((r) => [Number(r.id), r.name]));
  const keyOf = new Map(productRows.map((r) => [Number(r.id), nameKey(r.name ?? "")]));
  const same = (a: number, b: number) => a === b || (!!keyOf.get(a) && keyOf.get(a) === keyOf.get(b));

  const listingByKey = new Map(listings.map((l) => [l.url_key, l]));
  const byListing = new Map<string, MatchRow[]>();
  const byProduct = new Map<number, MatchRow[]>();
  for (const m of matches) {
    (byListing.get(m.url_key) ?? byListing.set(m.url_key, []).get(m.url_key)!).push(m);
    (byProduct.get(m.product_id) ?? byProduct.set(m.product_id, []).get(m.product_id)!).push(m);
  }
  for (const list of byListing.values()) list.sort((a, b) => a.rank - b.rank);

  const productSkus = new Map<number, Set<string>>();
  for (const r of skuRows) {
    const set = new Set<string>();
    const add = (s: string | null) => {
      const n = normalizeShopifySku(s);
      if (n) set.add(n);
    };
    add(r.canonical_sku);
    try {
      for (const a of JSON.parse(r.sku_aliases ?? "[]")) if (typeof a === "string") add(a);
    } catch {}
    productSkus.set(Number(r.product_id), set);
  }
  const skuOwners = new Map<string, number[]>();
  for (const [pid, set] of productSkus) {
    for (const sku of set) (skuOwners.get(sku) ?? skuOwners.set(sku, []).get(sku)!).push(pid);
  }

  // which product (if any) already holds each confirmed link at this store,
  // and every product sharing it (combo kits: Baneblade + Hellhammer, the
  // four Armiger/War Dog knights, ... are one listing for several products)
  const linkOwner = new Map<string, number>();
  const linkSharers = new Map<string, number[]>();
  for (const p of pairs) {
    const k = p.validated === 1 ? normalizeProductUrl(p.link) : null;
    if (!k) continue;
    linkOwner.set(k, p.product_id);
    (linkSharers.get(k) ?? linkSharers.set(k, []).get(k)!).push(p.product_id);
  }
  /** true when `other` is confirmed on the same link here: a combo kit, not a mistake */
  const comboPartner = (key: string, other: number) =>
    (linkSharers.get(key) ?? []).some((pid) => same(pid, other));

  // Safety brake: if a "complete" sync would make a big share of this store's
  // confirmed links disappear, the sync (or a URL-format change) is far more
  // likely to be wrong than the store delisting everything. Don't remove.
  const confirmedKeys = pairs
    .filter((p) => p.validated === 1)
    .map((p) => normalizeProductUrl(p.link))
    .filter((k): k is string => !!k);
  const missing = confirmedKeys.filter((k) => !listingByKey.has(k)).length;
  if (out.authoritative && missing > Math.max(20, confirmedKeys.length * 0.25)) {
    out.removalBrake = `${missing} of ${confirmedKeys.length} confirmed links missing from the sync; removals skipped`;
    console.warn(`[listings] seller=${sellerId}: ${out.removalBrake}`);
  }
  const canRemove = out.authoritative && !out.removalBrake;

  /** Best candidate listing for a product, and whether it's strong. */
  function bestFor(productId: number): { best: MatchRow; strong: boolean } | null {
    const ms = byProduct.get(productId);
    if (!ms?.length) return null;
    const raw = [...ms].sort((a, b) => rankKey(b) - rankKey(a))[0];
    const ranked = byListing.get(raw.url_key) ?? [];
    // rank among NON-equivalent products: a same-named twin above us doesn't count
    const effectiveRank = 1 + ranked.filter((m) => m.rank < raw.rank && !same(m.product_id, productId)).length;
    const best = { ...raw, rank: effectiveRank };
    const runnerUp = ranked.find((m) => !same(m.product_id, productId));
    const owner = linkOwner.get(best.url_key);
    const strong = isStrong(best, runnerUp) && (owner === undefined || same(owner, productId));
    return { best, strong };
  }

  /** A listing's top product if it's a confident, unambiguous match. */
  function strongOwnerOf(key: string): MatchRow | null {
    const ranked = byListing.get(key) ?? [];
    const top = ranked[0];
    if (!top) return null;
    const runnerUp = ranked.find((m) => !same(m.product_id, top.product_id));
    return isStrong(top, runnerUp) ? top : null;
  }

  const ops: { sql: string; params: unknown[] }[] = [];
  const now = new Date().toISOString();
  const note = (row: PairRow, action: string, detail: Record<string, unknown> = {}) => {
    if (out.sample.length < 150) out.sample.push({ product_id: row.product_id, action, ...detail });
  };
  const setPair = (row: PairRow, fields: Record<string, unknown>) => {
    const cols = Object.keys(fields);
    ops.push({
      sql: `UPDATE prices SET ${cols.map((c) => `${c} = ?`).join(", ")}, checked_at = ?
            WHERE seller_id = ? AND product_id = ?`,
      params: [...cols.map((c) => fields[c]), now, row.seller_id, row.product_id],
    });
  };
  const history = (row: PairRow, price: number, link: string) =>
    ops.push({ sql: `INSERT INTO price_history (seller_id, product_id, price, link) VALUES (?, ?, ?, ?)`, params: [row.seller_id, row.product_id, price, link] });
  const reasonFor = (m: MatchRow) => (m.reason === "sku" ? "SKU match" : `name match ${pct(m.confidence)}`);

  for (const row of pairs) {
    if (row.decided_by === "flag") {
      out.unchanged++;
      continue;
    }
    const found = bestFor(row.product_id);

    /* ---- confirmed pairs: keep prices fresh, notice removals/changes ---- */
    if (row.validated === 1) {
      const key = normalizeProductUrl(row.link);
      const live = key ? listingByKey.get(key) : undefined;
      if (live) {
        // Sanity checks on links nobody has confirmed by hand (your own
        // confirmations are never second-guessed):
        if (row.decided_by !== "human") {
          // 1. the store's SKU on this listing belongs to a different product
          const liveSku = normalizeShopifySku(live.sku);
          const owners = liveSku ? skuOwners.get(liveSku) : undefined;
          if (
            owners?.length &&
            !owners.some((o) => same(o, row.product_id) || comboPartner(key!, o))
          ) {
            setPair(row, {
              validated: null, decided_by: "flag",
              review_reason: `store listing "${live.title}" carries SKU ${liveSku}, which is ${productName.get(owners[0]) ?? "another product"}`,
            });
            out.flagged++;
            note(row, "flagged-sku-contradiction", { link: live.url });
            continue;
          }
          // 2. the listing is confidently some other product, and this one
          //    isn't even among its candidates (catches e.g. an Orks combat
          //    patrol pointing at the Drukhari one)
          const ranked = byListing.get(key!) ?? [];
          const top = strongOwnerOf(key!);
          if (
            top &&
            !comboPartner(key!, top.product_id) &&
            !ranked.some((m) => same(m.product_id, row.product_id))
          ) {
            setPair(row, {
              validated: null, decided_by: "flag",
              review_reason: `store listing "${live.title}" looks like ${productName.get(top.product_id) ?? "another product"} (${reasonFor(top)}), not this product`,
            });
            out.flagged++;
            note(row, "flagged-other-product", { link: live.url });
            continue;
          }
        }
        if (sanePrice(live.price) && live.price !== row.price) {
          setPair(row, { price: live.price, link: live.url });
          history(row, live.price, live.url);
          out.priceUpdates++;
        } else {
          out.unchanged++;
        }
        continue;
      }
      if (!canRemove || !key) {
        out.unchanged++;
        continue;
      }
      // the store no longer lists the confirmed link
      if (found?.strong && sanePrice(found.best.price)) {
        setPair(row, {
          link: found.best.url, price: found.best.price, decided_by: "auto",
          review_reason: `store replaced the listing; relinked by ${reasonFor(found.best)}`,
        });
        history(row, found.best.price, found.best.url);
        linkOwner.set(found.best.url_key, row.product_id);
        out.relinked++;
        note(row, "relinked", { link: found.best.url });
      } else {
        setPair(row, { validated: 0, decided_by: "auto", review_reason: "store removed this listing" });
        out.removedByStore++;
        note(row, "removed-by-store", { link: row.link });
      }
      continue;
    }

    /* ---- unchecked and "not stocked" pairs ---- */
    const revivable =
      row.validated === null ||
      row.decided_by === "auto" ||
      // human / legacy "not stocked": only an exact SKU match brings it back
      (found?.best.reason === "sku");

    if (found?.strong && sanePrice(found.best.price) && revivable) {
      setPair(row, {
        validated: 1, link: found.best.url, price: found.best.price,
        decided_by: "auto", review_reason: reasonFor(found.best),
      });
      history(row, found.best.price, found.best.url);
      linkOwner.set(found.best.url_key, row.product_id);
      if (row.validated === 0) out.revived++;
      else out.accepted++;
      note(row, row.validated === 0 ? "revived" : "accepted", { link: found.best.url, why: reasonFor(found.best) });
      continue;
    }

    if (row.validated === 0) {
      out.unchanged++;
      continue;
    }

    // unchecked from here on
    if (found) {
      const m = found.best;
      const why = found.strong
        ? `strong ${reasonFor(m)} but the listing has no usable price`
        : m.rank !== 1
          ? `"${m.title}" looks closer to another product (${pct(m.confidence)} for this one)`
          : linkOwner.has(m.url_key) && linkOwner.get(m.url_key) !== row.product_id
            ? `best listing "${m.title}" is already linked to another product`
            : m.confidence >= ACCEPT_CONFIDENCE
              ? `"${m.title}" (${pct(m.confidence)}) is too close to call against a similar product`
              : `best match "${m.title}" is only ${pct(m.confidence)}`;
      if (row.review_reason !== why) setPair(row, { review_reason: why });
      out.needsReview++;
      continue;
    }
    if (out.authoritative) {
      setPair(row, { validated: 0, link: null, decided_by: "auto", review_reason: "not in the store's catalogue" });
      out.notStocked++;
      continue;
    }
    const why = "no candidate in the last (partial) sync";
    if (row.review_reason !== why) setPair(row, { review_reason: why });
    out.needsReview++;
  }

  if (!dryRun && ops.length) {
    await inTransaction(async () => {
      for (const op of ops) await query("run", op.sql, op.params);
    });
  }
  console.log(
    `[listings] RECONCILE seller=${sellerId}${dryRun ? " (dry run)" : ""}: accepted=${out.accepted} revived=${out.revived} prices=${out.priceUpdates} relinked=${out.relinked} notStocked=${out.notStocked} removed=${out.removedByStore} flagged=${out.flagged} review=${out.needsReview}`,
  );
  return out;
}

/* ------------------------------------------------------------------ */
/* lookups for /tinder                                                 */
/* ------------------------------------------------------------------ */

export type LocalCandidate = {
  title: string;
  link: string;
  price: number | null;
  img: string | null;
  sku: string | null;
  available: boolean | null;
  score: number;
  reason: "sku" | "name";
};

/** Saved listings that matched this product at this store, best first. */
export async function localCandidates(sellerId: number, productId: number): Promise<LocalCandidate[]> {
  await ensureListingsSchema();
  const rows = (await query(
    "all",
    `SELECT l.title, l.url, l.price, l.image, l.sku, l.available, m.reason, m.confidence
     FROM listing_matches m
     JOIN store_listings l ON l.seller_id = m.seller_id AND l.url_key = m.url_key
     WHERE m.seller_id = ? AND m.product_id = ?
     ORDER BY (m.reason = 'sku') DESC, m.confidence DESC, m.exactness DESC
     LIMIT 10`,
    [sellerId, productId],
  )) as {
    title: string; url: string; price: number | null; image: string | null; sku: string | null;
    available: number | null; reason: string; confidence: number;
  }[];
  return rows.map((r) => ({
    title: r.title,
    link: r.url,
    price: r.price,
    img: r.image,
    sku: r.sku,
    available: r.available == null ? null : r.available === 1,
    score: r.reason === "sku" ? 1 : r.confidence,
    reason: r.reason === "sku" ? "sku" : "name",
  }));
}

/* ------------------------------------------------------------------ */
/* the whole pipeline                                                  */
/* ------------------------------------------------------------------ */

export function hasProductApi(seller: { storefront?: unknown; status?: string | null }): boolean {
  const cfg = parseSellerStorefront(seller.storefront);
  return !!cfg && cfg.platform !== "misc" && (seller.status ?? "active") !== "blocked";
}

export type PipelineResult = {
  sellers: (Partial<SyncResult> & { seller: string; sellerId: number; reconcile?: ReconcileResult; skipped?: string })[];
  totals: Omit<ReconcileResult, "sellerId" | "skipped" | "dryRun" | "authoritative" | "sample" | "removalBrake">;
  remainingForReview: number;
  ms: number;
};

/**
 * For each store with a product API: health-check it, sync its listings
 * (always / only when stale / never), then reconcile its price pairs.
 * One store at a time so memory stays flat.
 */
export async function runStorePipeline(opts: {
  sellerId?: number | null;
  sync?: "always" | "if-stale" | "never";
  dryRun?: boolean;
} = {}): Promise<PipelineResult> {
  await ensureListingsSchema();
  const { probeSellerHealth, reconcileSellerStatus } = await import("@/app/lib/seller-health");
  const t0 = Date.now();
  const syncMode = opts.sync ?? "always";
  const sellers = (await query(
    "all",
    opts.sellerId != null ? `SELECT * FROM sellers WHERE id = ?` : `SELECT * FROM sellers ORDER BY id`,
    opts.sellerId != null ? [opts.sellerId] : [],
  )) as SellerRow[];

  const totals: PipelineResult["totals"] = {
    accepted: 0, revived: 0, priceUpdates: 0, relinked: 0, notStocked: 0,
    removedByStore: 0, flagged: 0, needsReview: 0, unchanged: 0,
  };
  const results: PipelineResult["sellers"] = [];

  for (const s of sellers) {
    const sellerId = Number(s.id);
    const label = `${s.name ?? "Seller"}#${sellerId}`;
    const status = s.status || "active";
    if (status === "retired") {
      results.push({ seller: label, sellerId, skipped: "retired" });
      continue;
    }
    if (!hasProductApi(s)) {
      results.push({ seller: label, sellerId, skipped: "no product API (manual store)" });
      continue;
    }

    let syncRes: SyncResult | undefined;
    const last = (await query(
      "get",
      `SELECT finished_at FROM store_syncs WHERE seller_id = ? AND ok = 1 ORDER BY id DESC LIMIT 1`,
      [sellerId],
    )) as { finished_at: string | null } | undefined;
    const stale = !last?.finished_at || Date.now() - Date.parse(last.finished_at) > 24 * 60 * 60 * 1000;
    if (syncMode === "always" || (syncMode === "if-stale" && stale)) {
      const health = await probeSellerHealth(String(s.base_url ?? ""));
      const newStatus = await reconcileSellerStatus(sellerId, s.status, health);
      if (newStatus === "dead") {
        results.push({ seller: label, sellerId, skipped: `store unreachable (${health.detail})` });
        continue;
      }
      syncRes = await syncSellerListings(s);
    }

    const rec = await reconcileSeller(sellerId, { dryRun: opts.dryRun });
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += rec[k];
    results.push({ ...(syncRes ?? {}), seller: label, sellerId, reconcile: rec });
  }

  if (!opts.dryRun) {
    // products with no picture get one from their strongest store listing
    await query(
      "run",
      `UPDATE product_metadata SET image = (
         SELECT l.image FROM listing_matches m
         JOIN store_listings l ON l.seller_id = m.seller_id AND l.url_key = m.url_key
         WHERE m.product_id = product_metadata.product_id AND m.rank = 1
           AND (m.reason = 'sku' OR m.confidence >= ?) AND l.image IS NOT NULL AND l.image != ''
         ORDER BY (m.reason = 'sku') DESC, m.confidence DESC LIMIT 1)
       WHERE (image IS NULL OR image = '') AND EXISTS (
         SELECT 1 FROM listing_matches m
         JOIN store_listings l ON l.seller_id = m.seller_id AND l.url_key = m.url_key
         WHERE m.product_id = product_metadata.product_id AND m.rank = 1
           AND (m.reason = 'sku' OR m.confidence >= ?) AND l.image IS NOT NULL AND l.image != '')`,
      [ACCEPT_CONFIDENCE, ACCEPT_CONFIDENCE],
    );
  }

  const remaining = (await query("get", "select/count_unsorted")) as { c: number } | undefined;
  return { sellers: results, totals, remainingForReview: Number(remaining?.c ?? 0), ms: Date.now() - t0 };
}
