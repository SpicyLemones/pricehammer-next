CREATE TABLE IF NOT EXISTS manual_product_overrides (
  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  name TEXT,
  game TEXT,
  faction TEXT,
  category TEXT,
  points INTEGER,
  hidden INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
