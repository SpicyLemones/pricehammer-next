CREATE TABLE IF NOT EXISTS product_skus (
  product_id INTEGER PRIMARY KEY,
  canonical_sku TEXT,
  sku_aliases TEXT,
  name_aliases TEXT,
  source TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
