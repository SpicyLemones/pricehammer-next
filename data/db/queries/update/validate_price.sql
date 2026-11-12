-- A human confirmed this link in review: automation never overrides it
-- (see listings.ts for the decided_by rules).
UPDATE prices
SET
  validated = 1,
  link = ?,
  price = ?,
  decided_by = 'human',
  review_reason = NULL,
  checked_at = datetime('now')
WHERE
  seller_id = ?
  AND product_id = ?
