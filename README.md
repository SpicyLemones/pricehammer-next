# PriceHammer (+ spycy.fun)

Next.js 15 app deployed on Render. One codebase serves:

- **PriceHammer** (`pricehammer.xyz` → `/price-lookup`): Warhammer price comparison across Australian hobby stores.
- **Twitch tools** (`/twitch/*`): overlays, Chattergrounds, Wheel of Blame, stream quests.
- **Recession** pages (`/recession/*`): data you collect locally and push to prod.

Data lives in a single SQLite file (`DB_PATH`, default `data/db/data.sqlite`). On Render, point `DB_PATH` at a persistent disk or every deploy resets it.

## How prices get in

There is no web scraping. Every price comes from a store's own public API:

| Platform | Source | Used by |
| --- | --- | --- |
| Shopify | `/products.json` (full feed), `/search/suggest.json` (search) | most AU stores |
| WooCommerce | `/wp-json/wc/store/products` | Woo stores |
| GW | Algolia index behind warhammer.com | Warhammer Official |
| misc | none; links entered by hand in `/tinder?manual=1` | bot-walled stores |

### Nightly pipeline (`/api/admin/sync-stores`, `src/app/lib/listings.ts`)

1. **Sync.** Each store's catalogue is fetched one page at a time and matched against our products (SKU first, then names). The Warhammer listings and their top 3 product candidates are saved to `store_listings` / `listing_matches`.
2. **Reconcile.** Every price pair for that store is decided from the saved listings:
   - **Confirmed links:** the price is refreshed. If the store removed the listing, the pair is relinked to a clear replacement or marked not stocked. If the listing's SKU or title says it's a different product, the pair is **flagged**.
   - **Unchecked / not stocked:** a SKU match, or a clear name match of 85% or more, is accepted. Nothing similar in the store's catalogue means not stocked. Anything in between waits for review, with a reason.
3. **Review.** `/tinder` only gets what's left: flagged items first, then ambiguous matches. Candidates come from the saved listings (instant), with the store's live search as backup.

Who decided each pair is stored in `prices.decided_by`:

| Value | Meaning | Automation may change it? |
| --- | --- | --- |
| `auto` | decided by the pipeline | yes |
| `human` | decided by you in Tinder | never, except an exact SKU match reviving "not stocked", or the store removing the listing |
| `flag` | reports, price outliers, contradictions | no, waits for you |

Safety brakes:
- "Not stocked" and "removed" are only concluded from a complete, recent sync.
- If one sync would drop more than 25% of a store's confirmed links, removals are skipped for that run.
- Products sharing a confirmed link (combo kits) are never flagged against each other.

GitHub workflow `store-sync.yml`: the GW catalogue sync runs on Sundays; the store sync runs every night.

## Admin jobs

Long jobs (`/api/admin/sync-stores`, `/api/refresh-prices`, `/api/auto-validate`, `/api/admin/sync-gw-catalogue`) accept `?async=1` (or `{"async": true}`). They return a job id straight away; poll `GET <route>?job=<id>`.

- `sync-stores?sync=never&dryRun=1` re-decides from the saved listings and writes nothing.
- `auto-validate` only re-syncs stores whose listings are more than a day old.

## Commands

```bash
npm run dev               # local dev server
npm run build && npm start
npm run refresh:prices    # optional fallback: sync stores locally, push prices to prod
npm run push:prices       # push a local refresh to prod
npm run collect:recession # collect recession data locally
```

`ADMIN_USER` / `ADMIN_PASS` must be set in production. Without them, admin routes are open.
