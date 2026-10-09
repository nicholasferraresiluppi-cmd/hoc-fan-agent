SELECT
  t.*,
  si.funnel_id,
  si.trial_id,
  fs.spending_id
FROM
  hoc.transactions_v2 t
LEFT JOIN
  `onlyfans.subscriptions_intervals` si
ON
  t.creator_id = si.creator_id
  AND t.user_id = si.user_id
  AND t.created_at BETWEEN si.started_at
  AND si.ended_at
LEFT JOIN
  `hoc.funnels_sheets` AS fs
ON
  si.funnel_id = fs.id
LEFT JOIN
  `hoc.trials_sheets` AS ts
ON
  si.trial_id = ts.id