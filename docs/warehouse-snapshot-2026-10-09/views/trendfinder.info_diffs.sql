SELECT
  *,
  GREATEST(followed_by - IFNULL(LAG(followed_by) OVER (PARTITION BY owner_id ORDER BY date_key), followed_by), 0) AS followed_by_diff,
FROM
  `house-of-creators-358213.trendfinder.info_gaps_filled`