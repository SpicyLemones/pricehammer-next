-- Next pair for /tinder. Rule flags first (reports, outliers, SKU
-- contradictions — likely wrong on the live site), then automation's
-- undecided leftovers, grouped by store.
SELECT prices.*
FROM prices
JOIN sellers ON sellers.id = prices.seller_id
WHERE prices.validated IS NULL
  AND prices.review_reason IS NOT NULL
  AND COALESCE(sellers.status, 'active') = 'active'
  AND sellers.storefront IS NOT NULL
  AND sellers.storefront NOT LIKE '%"misc"%'
ORDER BY (prices.decided_by = 'flag') DESC, prices.seller_id, prices.product_id
LIMIT 1;
