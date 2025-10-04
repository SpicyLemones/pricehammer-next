SELECT
  p.id AS product_id,
  p.name AS product_name,
  p.search_term,
  pm.name AS metadata_name,
  pm.game,
  pm.faction,
  pm.category,
  pm.points,
  pm.hidden,
  pm.image
FROM products p
LEFT JOIN product_metadata pm ON pm.product_id = p.id
WHERE p.id = ?;
