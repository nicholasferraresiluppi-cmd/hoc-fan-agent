SELECT
  DATE(created_at)                          AS date,
  EXTRACT(DAY FROM created_at)              AS day_of_month,
  DATE_TRUNC(DATE(created_at), MONTH)       AS month,
  CASE
    WHEN creator_id = 411251447  THEN 'EN'
    WHEN creator_id = 250167499  THEN 'IT'
    WHEN creator_id = 1000000344 THEN 'ES'
  END                                       AS country,
  SUM(net)                           AS daily_revenue,
  COUNT(DISTINCT user_id)                   AS paying_users
FROM `house-of-creators-358213.onlyfans.attributed_transactions`
WHERE
  creator_id IN (411251447, 250167499, 1000000344)
  AND DATE(created_at) >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH)
GROUP BY 1, 2, 3, 4;