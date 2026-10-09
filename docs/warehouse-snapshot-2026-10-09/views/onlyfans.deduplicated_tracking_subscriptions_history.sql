SELECT
    sh.creator_id,
    sh.user_id,
    sh.created_at,
    DATE(sh.created_at, 'UTC') AS calendar_date,
    sh.funnel_id,
    f.name AS funnel_name,
    f.link AS funnel_url,
    t.organization_id
FROM
    `house-of-creators-358213.postgres.public_subscriptions_history` AS sh
    LEFT JOIN `house-of-creators-358213.postgres.public_funnels` AS f ON f.id = sh.funnel_id
    LEFT JOIN `house-of-creators-358213.postgres.public_creators` AS c ON c.id = sh.creator_id
    LEFT JOIN `house-of-creators-358213.postgres.public_talents` AS t ON t.id = c.talent_id 
WHERE
    f.created_at <= sh.created_at
QUALIFY ROW_NUMBER() OVER (PARTITION BY sh.creator_id, sh.user_id, calendar_date ORDER BY f.created_at DESC, sh.created_at DESC) = 1