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
| misc | none; links are entered by hand in `/tinder` | bot-walled stores |

- `src/app/lib/storefronts.ts` builds a per-store index from the full feed. Auto-validate and price refresh use it.
- `src/app/lib/store-search.ts` runs a single keyword search against the store's API. `/tinder` uses it, so a review card loads in about a second.

## Admin jobs

Long jobs (`/api/refresh-prices`, `/api/auto-validate`, `/api/admin/sync-gw-catalogue`) accept `?async=1` (or `{"async": true}`). They return a job id straight away; poll `GET <route>?job=<id>` for the result. The admin panel and the weekly GitHub workflow both work this way, so no request runs long enough for Render's proxy to cut it.

## Commands

```bash
npm run dev               # local dev server
npm run build && npm start
npm run refresh:prices    # refresh all prices locally, push results to prod
npm run push:prices       # push a local refresh to prod
npm run collect:recession # collect recession data locally
```

`ADMIN_USER` / `ADMIN_PASS` must be set in production. Without them, admin routes are open.
