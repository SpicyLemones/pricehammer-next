-- Next unchecked pair at a manual-only store (/tinder?manual=1).
SELECT prices.*
FROM prices
JOIN sellers ON sellers.id = prices.seller_id
WHERE prices.validated IS NULL
  AND COALESCE(sellers.status, 'active') NOT IN ('dead', 'retired')
  AND (COALESCE(sellers.status, 'active') = 'blocked'
       OR sellers.storefront IS NULL
       OR sellers.storefront LIKE '%"misc"%')
ORDER BY prices.seller_id, prices.product_id
LIMIT 1;
