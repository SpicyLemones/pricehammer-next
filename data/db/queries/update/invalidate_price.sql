UPDATE prices
SET
  validated = 0,
  link = NULL
WHERE
  seller_id = ?
  AND product_id = ?;