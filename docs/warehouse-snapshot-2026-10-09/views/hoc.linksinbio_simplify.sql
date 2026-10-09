SELECT
  event_date,
  event_datetime,
  event_name,
  page_link,
  user_pseudo_id,
  mobile_brand_name,
  browser,
  stream_id,
  country
FROM (
    SELECT
      event_date,
      TIMESTAMP_MICROS(event_timestamp) AS event_datetime,
      event_name,
      CASE
        WHEN REGEXP_CONTAINS(
          IFNULL(
            (
              SELECT param.value.string_value
              FROM UNNEST(event_params) AS param
              WHERE param.key = 'page_location'
            ), ''
          ),
          r'[?&]page='
        ) THEN
          REGEXP_EXTRACT(
            IFNULL(
              (
                SELECT param.value.string_value
                FROM UNNEST(event_params) AS param
                WHERE param.key = 'page_location'
              ), ''
            ),
            r'([^?]+(?:\?[^#]*page=[^&]+)?)'
          )
        ELSE
          REGEXP_EXTRACT(
            IFNULL(
              (
                SELECT param.value.string_value
                FROM UNNEST(event_params) AS param
                WHERE param.key = 'page_location'
              ), ''
            ),
            r'([^?]+)'
          )
      END AS page_link,
      user_pseudo_id,
      device.mobile_brand_name AS mobile_brand_name,
      device.web_info.browser AS browser,
      stream_id,
      geo.country,
      ROW_NUMBER() OVER (
        PARTITION BY event_date, user_pseudo_id
        ORDER BY event_timestamp DESC
      ) AS row_number
    FROM
      `hoc.linksinbio_unionall`
    -- WHERE
      -- event_name = 'page_view'
)
WHERE
  row_number = 1
ORDER BY
  event_date DESC, event_datetime DESC
