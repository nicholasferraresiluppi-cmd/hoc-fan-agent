WITH latest_notifications AS (
  SELECT
    DATE(sn.created_at) AS notification_date,
    sn.id AS notification_id,
    sn.creator_id,
    sn.user_id,
    sn.created_at AS subs_notification_created,
    sn.sub_type
  FROM
    `postgres.public_notifications` sn
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY sn.creator_id, sn.user_id, DATE(sn.created_at)
    ORDER BY sn.created_at DESC
  ) = 1 -- Manteniamo solo la notifica più recente per giorno
),
matched_trials AS (
  SELECT
    ln.notification_id,
    ln.notification_date,
    ln.creator_id,
    ln.user_id,
    ln.subs_notification_created as created_at,
    ln.sub_type,
    dts.trial_id,
    dts.created_at AS dts_created
  FROM
    latest_notifications ln
  LEFT JOIN
    `hoc.deduplicated_trials_subscriptions_history` dts
  ON
    ln.creator_id = dts.creator_id
    AND ln.user_id = dts.user_id
    AND ln.notification_date = DATE(dts.created_at) -- Match solo se nello stesso giorno
)
SELECT
  mt.creator_id,
  c.name AS creator_name,
  mt.user_id,
  mt.trial_id,
  t.name AS trial_name,
  mt.created_at,
  DATE(mt.created_at) AS calendar_date,
  mt.sub_type,
  c.active,
  c.language,
  ts.spending_id
FROM
  matched_trials mt
LEFT JOIN
  `postgres.public_creators` c
ON
  mt.creator_id = c.id
LEFT JOIN
  `postgres.public_trials` t
ON
  t.id=mt.trial_id
LEFT JOIN
  `hoc.trials_sheets` AS ts
ON
  ts.id=mt.trial_id
WHERE
  mt.sub_type IN ('new_subscriber_trial')

ORDER BY
  mt.created_at DESC;
