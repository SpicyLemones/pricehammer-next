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
ON CONFLICT(product_id) DO NOTHING;
