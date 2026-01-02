SELECT *
FROM prices
WHERE validated IS NULL
ORDER BY seller_id, product_id
LIMIT 1;