SELECT prices.*
FROM prices
JOIN sellers ON sellers.id = prices.seller_id
WHERE prices.validated IS NULL
  AND COALESCE(sellers.status, 'active') NOT IN ('dead', 'retired')
-- Stores with a searchable API first (instant candidates); bot-walled /
-- feed-less stores, which need links pasted by hand, go to the back.
ORDER BY
  (COALESCE(sellers.status, 'active') = 'blocked'
    OR sellers.storefront IS NULL
    OR sellers.storefront LIKE '%"misc"%') ,
  prices.seller_id,
  prices.product_id
LIMIT 1;
