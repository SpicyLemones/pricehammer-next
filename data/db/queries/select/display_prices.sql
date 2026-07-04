SELECT
  sellers.name AS seller_name,
  sellers.shipping_info AS shipping_info,
  price,
  link
FROM
  prices
  JOIN sellers ON prices.seller_id = sellers.id
WHERE
  product_id = ?
  AND validated = 1
  AND COALESCE(sellers.status, 'active') NOT IN ('dead', 'retired');
