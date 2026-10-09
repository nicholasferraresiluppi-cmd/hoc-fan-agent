WITH prep AS (
    SELECT
        creator_id,
        spending_id,
        date_spent AS calendar_date,
        SUM(conversions_number) AS clicks_number,
        AVG(CASE WHEN cpcn > 0 THEN cpcn ELSE NULL END) AS cpv,
        SUM(spent) AS spent,
        SUM(spent * CASE WHEN spending_id LIKE '%fb%' OR spending_id LIKE '%ig%' THEN 1.155 ELSE 1.05 END) AS def_spent
    FROM
        `house-of-creators-358213.hoc.ad_spend`
    WHERE
        spending_id IS NOT NULL
    GROUP BY ALL
)

SELECT
    prep.*,
    t.organization_id
FROM
    prep
    LEFT JOIN `house-of-creators-358213.postgres.public_creators` AS c ON c.id = prep.creator_id
    LEFT JOIN `house-of-creators-358213.postgres.public_talents` AS t ON t.id = c.talent_id