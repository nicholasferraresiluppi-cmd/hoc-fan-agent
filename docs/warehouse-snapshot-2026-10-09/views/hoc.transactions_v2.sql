SELECT
  id,
  body,
  creator_id,
  user_id,
  created_at,
  DATE(created_at, 'UTC') AS calendar_date,
  CAST(JSON_EXTRACT_SCALAR(body, '$.amount') AS NUMERIC) AS amount,
  CAST(JSON_EXTRACT_SCALAR(body, '$.fee') AS NUMERIC) AS fee,
  CAST(JSON_EXTRACT_SCALAR(body, '$.net') AS NUMERIC) AS net,
  CAST(JSON_EXTRACT_SCALAR(body, '$.vatAmount') AS NUMERIC) AS vat_amount,
  CASE
    WHEN JSON_EXTRACT_SCALAR(body, '$.description') LIKE 'Payment for message from%' THEN 'message'
    WHEN JSON_EXTRACT_SCALAR(body, '$.description') LIKE 'Recurring subscription from%' THEN 'recurring_subscription'
    WHEN JSON_EXTRACT_SCALAR(body, '$.description') LIKE 'Subscription from%' THEN 'subscription'
    WHEN JSON_EXTRACT_SCALAR(body, '$.description') LIKE 'Post purchase by%' THEN 'post'
    WHEN JSON_EXTRACT_SCALAR(body, '$.description') LIKE 'Tip from%' THEN 'tip'
    ELSE 'other'
END
  AS type,
  JSON_EXTRACT_SCALAR(body, '$.description') AS description,
FROM
  `postgres.public_transactions`