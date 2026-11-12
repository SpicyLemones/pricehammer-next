-- Undo in review: back to the queue for another look.
UPDATE prices
SET
  validated = NULL,
  decided_by = 'flag',
  review_reason = 'undone in review'
WHERE
  seller_id = ?
  AND product_id = ?;
