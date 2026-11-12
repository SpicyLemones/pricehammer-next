SELECT COUNT(*) AS c
FROM prices
JOIN sellers ON sellers.id = prices.seller_id
WHERE prices.validated IS NULL
  AND COALESCE(sellers.status, 'active') NOT IN ('dead', 'retired');
