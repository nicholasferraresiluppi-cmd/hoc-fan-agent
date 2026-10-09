SELECT 
    *
FROM (
        SELECT 
            COUNT(*) AS cnt
        FROM 
            `house-of-creators-358213.tf.raw_reels`
        WHERE
            DATE(batch_timestamp) = CURRENT_DATE("UTC")
    )
WHERE 
    cnt = 0