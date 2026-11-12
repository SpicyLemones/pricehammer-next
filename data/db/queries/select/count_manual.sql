-- Unchecked pairs at stores without a product API (bot-walled / custom
-- sites). Only reviewed when you choose to: /tinder?manual=1
SELECT COUNT(*) AS c
FROM prices
JOIN sellers ON sellers.id = prices.seller_id
WHERE prices.validated IS NULL
  AND COALESCE(sellers.status, 'active') NOT IN ('dead', 'retired')
  AND (COALESCE(sellers.status, 'active') = 'blocked'
       OR sellers.storefront IS NULL
       OR sellers.storefront LIKE '%"misc"%');
