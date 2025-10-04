INSERT INTO manual_product_overrides (
  product_id,
  name,
  game,
  faction,
  category,
  points,
  hidden,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
ON CONFLICT(product_id) DO UPDATE SET
  name = excluded.name,
  game = excluded.game,
  faction = excluded.faction,
  category = excluded.category,
  points = excluded.points,
  hidden = excluded.hidden,
  updated_at = datetime('now');
