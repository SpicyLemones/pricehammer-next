SELECT
  sellers.name AS seller_name,
  price,
  link
FROM
  prices
  JOIN sellers ON prices.seller_id = sellers.id
WHERE
  product_id = ?
  AND validated = 1
  AND COALESCE(sellers.status, 'active') NOT IN ('dead', 'retired');