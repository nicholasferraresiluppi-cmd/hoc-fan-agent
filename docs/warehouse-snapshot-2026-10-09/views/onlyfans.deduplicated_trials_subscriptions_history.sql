SELECT
    sh.creator_id,
    sh.user_id,
    sh.created_at,
    DATE(sh.created_at, 'UTC') AS calendar_date,
    sh.trial_id,
    t.name AS trial_name,
    t.link AS trial_url,
    ta.organization_id
FROM
    `house-of-creators-358213.postgres.public_trials_subscriptions_history` AS sh
    LEFT JOIN `house-of-creators-358213.postgres.public_trials` AS t ON t.id = sh.trial_id
    LEFT JOIN `house-of-creators-358213.postgres.public_creators` AS c ON c.id = sh.creator_id
    LEFT JOIN `house-of-creators-358213.postgres.public_talents` AS ta ON ta.id = c.talent_id
WHERE
    t.created_at <= sh.created_at
QUALIFY ROW_NUMBER() OVER (PARTITION BY sh.creator_id, sh.user_id, calendar_date ORDER BY t.created_at DESC, sh.created_at DESC) = 1