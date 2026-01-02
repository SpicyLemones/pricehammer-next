CREATE TABLE IF NOT EXISTS product_metadata (
  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  game TEXT,
  faction TEXT,
  category TEXT,
  points REAL,
  hidden INTEGER DEFAULT 0,
  image TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
