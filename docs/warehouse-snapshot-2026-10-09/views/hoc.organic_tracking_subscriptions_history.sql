WITH filtered_notifications AS (
  SELECT
    DATE(sn.created_at) AS notification_date,
    sn.id AS notification_id,
    sn.creator_id,
    sn.user_id,
    sn.created_at AS subs_notification_created,
    sn.sub_type,
    ROW_NUMBER() OVER (
      PARTITION BY sn.creator_id, sn.user_id, DATE(sn.created_at)
      ORDER BY sn.created_at DESC
    ) AS rn
  FROM
    `postgres.public_notifications` sn
),
latest_notifications AS (
  SELECT
    notification_date,
    notification_id,
    creator_id,
    user_id,
    subs_notification_created,
    sub_type
  FROM
    filtered_notifications
  WHERE
    rn = 1 -- Manteniamo solo la notifica più recente per giorno
),
matched_funnels AS (
  SELECT
    ln.notification_id,
    ln.notification_date,
    ln.creator_id,
    ln.user_id,
    ln.subs_notification_created,
    ln.sub_type,
    dtsh.funnel_id,
    f.name AS funnel_name,
    f.created_at AS funnel_created,
    dtsh.created_at AS dtsh_created
  FROM
    latest_notifications ln
  LEFT JOIN
    `hoc.deduplicated_tracking_subscriptions_history` dtsh
  ON
    ln.creator_id = dtsh.creator_id
    AND ln.user_id = dtsh.user_id
    AND ln.notification_date = DATE(dtsh.created_at) -- Match solo se nello stesso giorno
  LEFT JOIN
    `hoc.funnels` f
  ON
    dtsh.funnel_id = f.id
)
SELECT
  mf.creator_id,
  c.name as creator_name,
  mf.user_id,
  mf.funnel_id,
  mf.funnel_name,
  mf.subs_notification_created as created_at,
  DATE(mf.subs_notification_created, 'UTC') AS calendar_date,
  mf.sub_type,
  c.active,
  c.language,
  fs.spending_id
  --mf.funnel_created,
  --mf.dtsh_created
FROM
  matched_funnels mf
LEFT JOIN hoc.creators c
on c.id=mf.creator_id
LEFT JOIN
  `hoc.funnels_sheets` AS fs
ON
  fs.id=mf.funnel_id
WHERE
    mf.sub_type IN('new_subscriber',
      'returning_subscriber')
ORDER BY
  mf.subs_notification_created desc;
