-- Pairs waiting in /tinder: things automation looked at and couldn't decide
-- (review_reason set) at stores with a product API. Manual-only stores are
-- counted separately (select/count_manual).
SELECT COUNT(*) AS c
FROM prices
JOIN sellers ON sellers.id = prices.seller_id
WHERE prices.validated IS NULL
  AND prices.review_reason IS NOT NULL
  AND COALESCE(sellers.status, 'active') = 'active'
  AND sellers.storefront IS NOT NULL
  AND sellers.storefront NOT LIKE '%"misc"%';
