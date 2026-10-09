SELECT
  *,
  DATE(created_at, 'UTC') AS calendar_date
FROM
  `postgres.public_notifications`