WITH
  duped_user_rename AS (
  SELECT
    cl.creator_id,
    cl.user_id,
    STRING_AGG(cl.`rename`, ' '
    ORDER BY
      q.rename_priority) raw_display_name
  FROM
    `house-of-creators-358213.of_lists.cache_lists` cl
  LEFT JOIN
    `of_lists.queries` q
  ON
    cl.`rename` = q.`rename`
  GROUP BY
    creator_id,
    user_id)
SELECT
  creator_id,
  user_id,
  ARRAY_TO_STRING(ARRAY(
    SELECT
      DISTINCT word
    FROM
      UNNEST(SPLIT(raw_display_name, ' ')) AS word), ' ') AS display_name
FROM
  duped_user_rename