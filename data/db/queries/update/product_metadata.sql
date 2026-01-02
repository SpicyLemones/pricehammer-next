INSERT INTO product_metadata (
  product_id,
  name,
  game,
  faction,
  category,
  points,
  hidden,
  image
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(product_id) DO UPDATE SET
  name = excluded.name,
  game = excluded.game,
  faction = excluded.faction,
  category = excluded.category,
  points = excluded.points,
  hidden = excluded.hidden,
  image = excluded.image,
  updated_at = CURRENT_TIMESTAMP;
