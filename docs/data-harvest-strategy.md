# Improving product matching for scraped retailer data

This note summarises options for making the scraping pipeline more deterministic
when a storefront search page returns loosely related items.

## 1. Use stable product identities as the primary key
* **Build a canonical SKU catalogue first** – there is no published master list
  of Games Workshop SKUs, so plan a one-off crawl of the official Warhammer web
  store to seed your database. Product pages embed the SKU inside the
  `window.__PRELOADED_STATE__` payload and in the `data-product-sku` attribute
  of the “Add to cart” button. Store the extracted SKU (and any variant codes)
  alongside the Games Workshop URL so you can diff future changes.
* **Automate canonical refreshes** – schedule a weekly job that walks the
  Warhammer sitemap (or replays saved product URLs) to detect new releases and
  discontinued kits. Persist the SKU/name/price triple as the ground truth that
  retailer scrapes are validated against.
* **Prefer manufacturer identifiers during matching** – look up the canonical
  SKU for each search task and compare it against the identifier extracted from
  every retailer listing before accepting it. For Shopify stores you can usually
  read the SKU from the `data-product-sku` attribute, JSON-LD in the `<script
  type="application/ld+json">` blob, or the `/products/<handle>.js` endpoint;
  WooCommerce exposes the SKU inside `/wp-json/wc/store/products` and on the
  product detail page meta tags.
* **Support multiple aliases** – maintain a table of alternate SKUs where
  resellers use their own numbering scheme. This can be keyed off
  `seller.id` so that we still allow cross-store comparisons.
* **Fallback to fuzzy name matching** – if the SKU is missing, use normalized
  string matching (e.g. Levenshtein distance after stripping punctuation and
  army names) together with price sanity checks already implemented in
  `searchSeller` to avoid false positives. 【F:src/app/lib/scraper.ts†L61-L112】【F:src/app/lib/scraper.ts†L286-L395】

## 2. Query structured APIs when available
* **Shopify Storefront API** – many independent hobby stores sit on Shopify.
  Without authentication you can usually request `/products.json?limit=250` or
  `/products/<handle>.js`. Authenticated access via the Storefront GraphQL API
  yields richer data (inventory, variant SKUs, compare-at prices) once the
  merchant enables a Storefront token. Cache the returned `variant.sku` values
  and reuse them during later refreshes rather than scraping HTML repeatedly.
* **Built-in Shopify feed endpoint** – POST `/api/shopify-feed` with the
  retailer base URL to gather every product and its variants via Shopify's
  `products.json` feed. The endpoint normalises `variant.sku` values (e.g.
  converting `prod4780167-99120218061` to `99120218061`) and reports how many
  pages were fetched. If the feed is disabled or errors, the response prompts
  you to fall back to SKU verification on the HTML page.
* **WooCommerce REST API** – for WordPress shops, `/wp-json/wc/store/products`
  exposes structured JSON including IDs, SKUs, and price fields. If a merchant
  disables the public endpoints, fall back to `/wp-json/wc/v3/products` with an
  application password, which many retailers will provide for partners.
* **Custom JSON feeds** – some retailers publish inventory feeds or make them
  available on request. Support ingesting these as a separate pipeline and fall
  back to HTML scraping only when no feed exists.

## 3. Enrich retailer-specific scraping strategies
* **Capture SKUs even when hidden** – many storefronts keep the SKU in the DOM
  but off-screen (e.g. `<span class="product-sku" aria-hidden="true">`). Others
  expose it via embedded JSON-LD (`"sku": "99120101156"`) or analytics data
  layers (`dataLayer.push({ product: { sku: ... } })`). Extend your scraper to
  parse these common patterns so you do not rely on visible text alone.
* **Ask for retailer mappings** – when a store invents its own SKU scheme,
  request their price feed or mapping table once and cache it in
  `seller_sku_aliases`. You can then transform retailer-specific codes back to
  the Games Workshop canonical SKU during matching.
* **Provide a manual override path** – keep the existing inspect-and-copy flow
  for edge cases, but persist any manually confirmed SKU so the knowledge is
  never lost. Each manual entry should short-circuit future searches for that
  seller/product pair.

## 4. Add a second validation pass before persisting
* **Resolve the product page** – after picking the most likely listing, load the
  product detail page and verify that the canonical name contains the search
  term and/or SKU. `fetchPriceFromLinkWithSellerSelectors` already opens the
  detail page; extend it to parse the SKU field (common selectors: `#sku`,
  `.product-sku`, `meta[itemprop="sku"]`). 【F:src/app/lib/scraper.ts†L116-L277】
* **Cross-check with expected price ranges** – store the Games Workshop RRP per
  kit and reject any listing outside ±40% unless it is explicitly marked as
  discounted, reducing the chance of attaching accessories or bundles.
* **Log low-confidence matches** – add telemetry for listings that required
  fuzzy matching or failed SKU validation so you can manually curate them.

## 5. Normalise and cache seller-specific quirks
* **Seller-specific matchers** – enhance `Seller` with optional `sku_selector`
  and `title_normalizer` callbacks. This lets you strip store branding (e.g.
  "[PRE-ORDER]" prefixes) before comparisons and ensures `cacheKey` entries map
  to clean product IDs. 【F:src/app/lib/scraper.ts†L41-L113】
* **Store canonical URLs** – when you confirm a listing, persist the definitive
  product URL in the database. Subsequent refreshes can skip search entirely and
  go directly to `fetchPriceFromLinkWithSellerSelectors`.
* **Gracefully handle non-Shopify storefronts** – define per-platform adapters
  (Shopify, WooCommerce, Magento, custom) that each expose `searchBySku`,
  `searchByName`, and `fetchByHandle`. The scraper can detect the platform once
  per seller and then choose the most reliable adapter implementation.

## 6. Operational safeguards
* **Manual overrides** – keep a curated map of `seller_id -> product_id ->
  canonical_link`. When populated, short-circuit scraping to that URL.
* **Backfill tasks** – create a nightly job that re-processes low-confidence
  rows so manual fixes propagate automatically.
* **Testing sandbox** – run new selectors and heuristics against stored HTML
  fixtures before deploying them, minimising production regressions.

Combining these layers moves the system from "first search hit wins" toward a
confidence-scored pipeline that prefers verifiable identifiers, making prices
far more reliable even across heterogeneous ecommerce stacks.
