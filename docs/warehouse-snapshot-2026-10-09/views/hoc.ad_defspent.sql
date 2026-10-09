SELECT
  ad.creator_id,
  ad.spending_id,
  ad.date_spent AS calendar_date,
  SUM(ad.conversions_number) AS clicks_number,
  AVG(CASE WHEN ad.cpcn > 0 THEN ad.cpcn ELSE NULL END) AS cpv,
  SUM(ad.spent) AS spent,
  -- Markup rimosso il 17 ago 2026, in coppia con onlyfans.ad_def_spent (erano due
  -- implementazioni della stessa regola: cambiarne una sola le fa divergere).
  SUM(ad.spent) AS def_spent
FROM `house-of-creators-358213.hoc.ad_spend` ad
WHERE ad.spending_id IS NOT NULL
GROUP BY ad.creator_id, ad.spending_id, ad.date_spent