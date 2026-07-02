CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  price REAL,
  link TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
