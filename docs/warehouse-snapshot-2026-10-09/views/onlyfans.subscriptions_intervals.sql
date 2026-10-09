WITH subscriptions_intervals AS (
    SELECT
        creator_id,
        creator_name,
        user_id,
        username,
        created_at AS started_at,
        calendar_date AS started_calendar_date,
        funnel_id,
        trial_id,
        link_name,
        link_url,
        spending_id,
        contribution,
        LEAD(TIMESTAMP_SUB(created_at, INTERVAL 1 SECOND), 1, CURRENT_TIMESTAMP()) OVER (PARTITION BY creator_id, user_id ORDER BY created_at) AS ended_at,
        LEAD(DATE_SUB(calendar_date, INTERVAL 1 DAY), 1, CURRENT_DATE('UTC')) OVER (PARTITION BY creator_id, user_id ORDER BY created_at) AS ended_calendar_date,
        organization_id
    FROM
        `house-of-creators-358213.onlyfans.links_subscriptions` 
)

SELECT
    *,
    TIMESTAMP_DIFF(ended_at, started_at, SECOND) AS interval_seconds
FROM
    subscriptions_intervals