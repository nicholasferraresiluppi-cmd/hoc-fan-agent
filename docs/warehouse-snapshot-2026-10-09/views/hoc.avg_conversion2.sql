WITH subscriptions AS (
    SELECT
        s.calendar_date,
        s.funnel_id,
        s.creator_id,
        COUNT(t.id) AS transactions_count,
        COUNT(DISTINCT t.user_id) AS spending_users,
        COUNT(DISTINCT s.user_id) AS subscribed_users,
        AVG(CASE WHEN t.id IS NOT NULL THEN TIMESTAMP_DIFF(t.created_at, s.created_at, DAY) ELSE NULL END) AS avg_conversion_days,
        SUM(CASE WHEN t.id IS NOT NULL THEN t.net ELSE 0 END) AS net_revenue
    FROM
        `hoc.organic_subscriptions_history` AS s
    LEFT JOIN
        `hoc.attributed_transactions` AS t
    ON
        s.creator_id = t.creator_id
        AND s.user_id = t.user_id
        AND (s.funnel_id IS NULL OR s.funnel_id = t.funnel_id)
        --AND DATE(t.created_at) = DATE(s.created_at) -- Check same day
        AND TIME(t.created_at) > TIME(s.created_at) -- t.created_at must be later than s.created_at within the same day
    where t.type NOT IN ('subscription', 'recurring_subscription')
        AND s.sub_type in ('new_subscriber','new_subscriber_trial')
    GROUP BY
        s.calendar_date, s.funnel_id, s.creator_id
)
SELECT
    s.calendar_date,
    c.name AS creator_name,
    COALESCE(f.name, 'Organic') AS funnel_name, -- Usa 'Organic' per indicare i funnel_id nulli
    s.transactions_count,
    s.spending_users,
    s.subscribed_users,
    s.avg_conversion_days,
    s.net_revenue
FROM
    subscriptions s
LEFT JOIN
    `hoc.funnels` f ON s.funnel_id = f.id
LEFT JOIN
    `hoc.creators` c ON s.creator_id = c.id
WHERE
    s.spending_users >= 0
ORDER BY
    s.calendar_date desc, c.name, funnel_name;
