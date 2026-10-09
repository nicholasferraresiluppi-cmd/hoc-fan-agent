SELECT 
    *
FROM 
    EXTERNAL_QUERY(
        "house-of-creators-358213.europe-west3.db-production-connection", 
        "SELECT * FROM accounts_creators"
    )