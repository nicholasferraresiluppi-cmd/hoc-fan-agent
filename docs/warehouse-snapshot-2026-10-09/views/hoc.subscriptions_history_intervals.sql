    SELECT
      creator_id,
      user_id,
      funnel_id,
      NULL AS trial_id,
      start_time,
      end_time,
      start_calendar_date,
      end_calendar_date
    FROM
      `hoc.tracking_subscriptions_history_intervals`
    UNION ALL
    SELECT
      creator_id,
      user_id,
      NULL AS funnel_id,
      trial_id,
      start_time,
      end_time,
      start_calendar_date,
      end_calendar_date
    FROM
      `hoc.trials_subscriptions_history_intervals`
