SELECT
  rs.id,
  rs.platform_id,
  -- COALESCE controlla prima se il dato è nell'array (item), altrimenti guarda nella radice (data)
  COALESCE(JSON_VALUE(item, '$.id'), JSON_VALUE(`data`, '$.id')) AS content_id,
  COALESCE(JSON_VALUE(item, '$.fbid'), JSON_VALUE(`data`, '$.fbid')) AS fbid,
  rs.commit_timestamp,
  -- Gestione della data
  DATE(TIMESTAMP_SECONDS(CAST(COALESCE(JSON_VALUE(item, '$.taken_at'), JSON_VALUE(`data`, '$.taken_at')) AS INT64)), 'UTC') AS create_date,
  COALESCE(JSON_VALUE(item, '$.code'), JSON_VALUE(`data`, '$.code')) AS code,
  COALESCE(JSON_VALUE(item, '$.accessibility_caption'), JSON_VALUE(`data`, '$.accessibility_caption')) AS accessibility_caption,
  COALESCE(JSON_VALUE(item, '$.owner.id'), JSON_VALUE(`data`, '$.owner.id')) AS owner_id,
  COALESCE(JSON_VALUE(item, '$.owner.username'), JSON_VALUE(`data`, '$.owner.username')) AS username,
  COALESCE(JSON_VALUE(item, '$.media_format'), JSON_VALUE(`data`, '$.media_format')) AS media_type,
  TIMESTAMP_TRUNC(rs.batch_timestamp, HOUR) AS batch_timestamp,
  rs.label,
  rs.organization_id
FROM
    `house-of-creators-358213.ig.raw_stories` AS rs
    -- Il LEFT JOIN è fondamentale: non elimina la riga se $.items è assente
    LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(`data`, '$.items')) AS item