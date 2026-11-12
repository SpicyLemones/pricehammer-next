-- A human said this store doesn't stock the product (or every candidate was
-- wrong). Only an exact SKU match will bring it back automatically.
UPDATE prices
SET
  validated = 0,
  link = NULL,
  decided_by = 'human',
  review_reason = 'marked not stocked in review',
  checked_at = datetime('now')
WHERE
  seller_id = ?
  AND product_id = ?;
