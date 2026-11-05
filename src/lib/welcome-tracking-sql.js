// Benvenuto a pagamento — la query (definizioni e verifica in lib/welcome-tracking-core.js).
//
// Una sola lettura: nuovi iscritti del periodo (onlyfans.organic_subscriptions), primo messaggio della
// pagina entro 2 ore (onlyfans.chat, consolidato giornaliero: il periodo si ferma a ieri — la chat in
// tempo reale costerebbe ~28 GB al mese contro ~1 GB), acquisti di messaggi entro 72 ore
// (onlyfans.attributed_transactions, `amount` = prezzo lordo pagato dal fan).
// Esce pagina × giorno (Europe/Rome) × prezzo: summarize() ne fa i periodi.

import { UNLOCK_WINDOW_H, WELCOME_WINDOW_H, isDay } from "./welcome-tracking-core.js";

const day = (s) => {
  if (!isDay(s)) throw new Error("data non valida");
  return `DATE '${s}'`;
};
const ids = (list) => {
  const clean = [...new Set((list || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!clean.length) throw new Error("nessuna creator");
  return clean.join(",");
};

/** Finestre dei prezzi a mano (ruleWindows) → CTE. Valori forzati a numero/data: nessun testo dell'utente in query. */
function rulesCte(windows, range) {
  const rows = (windows || [])
    .filter((w) => Number.isInteger(Number(w.creator_id)) && Number.isFinite(Number(w.price)) && isDay(w.from))
    .map((w) => `STRUCT(${Number(w.creator_id)} AS creator_id, ${Number(w.price).toFixed(2)} AS price, ${day(w.from)} AS dfrom, ${day(w.to || range.to)} AS dto, ${JSON.stringify(String(w.rule_id || "m").replace(/[^a-z0-9_-]/gi, ""))} AS rule_id)`);
  if (!rows.length) return "rules AS (SELECT 0 AS creator_id, 0.0 AS price, DATE '1970-01-01' AS dfrom, DATE '1970-01-01' AS dto, '' AS rule_id FROM UNNEST([1]) WHERE FALSE)";
  return `rules AS (SELECT * FROM UNNEST([${rows.join(", ")}]))`;
}

export function welcomeTrackingSql(refs, creatorIds, range, windows = []) {
  const IDS = ids(creatorIds);
  const start = `TIMESTAMP(${day(range.from)}, 'Europe/Rome')`;
  const end = `TIMESTAMP(DATE_ADD(${day(range.to)}, INTERVAL 1 DAY), 'Europe/Rome')`;
  return `
WITH ${rulesCte(windows, range)},
subs AS (
  SELECT creator_id, user_id, MIN(created_at) AS sub_at
  FROM \`${refs.organicSubs}\`
  WHERE creator_id IN (${IDS}) AND sub_type = 'new_subscriber' AND created_at >= ${start} AND created_at < ${end}
  GROUP BY creator_id, user_id, DATE(created_at, 'Europe/Rome')
),
msgs AS (
  SELECT creator_id, user_id, created_at AS ts, COALESCE(SAFE_CAST(price AS FLOAT64), 0) AS price
  FROM \`${refs.chat}\`
  WHERE creator_id IN (${IDS}) AND sender_id != user_id
    AND created_at >= ${start} AND created_at < TIMESTAMP_ADD(${end}, INTERVAL ${WELCOME_WINDOW_H} HOUR)
),
first_out AS (
  SELECT s.creator_id, s.user_id, s.sub_at,
    ARRAY_AGG(IF(m.ts IS NULL, NULL, STRUCT(m.ts, m.price)) IGNORE NULLS ORDER BY m.ts LIMIT 1)[SAFE_OFFSET(0)].price AS first_price
  FROM subs s
  LEFT JOIN msgs m ON m.creator_id = s.creator_id AND m.user_id = s.user_id
    AND m.ts >= s.sub_at AND m.ts <= TIMESTAMP_ADD(s.sub_at, INTERVAL ${WELCOME_WINDOW_H} HOUR)
  GROUP BY 1, 2, 3
),
tagged AS (
  SELECT f.creator_id, f.user_id, f.sub_at, DATE(f.sub_at, 'Europe/Rome') AS d,
    r.rule_id IS NOT NULL AS manual, r.rule_id,
    COALESCE(r.price, IF(f.first_price > 0, ROUND(f.first_price, 2), NULL)) AS price
  FROM first_out f
  LEFT JOIN rules r ON r.creator_id = f.creator_id AND DATE(f.sub_at, 'Europe/Rome') BETWEEN r.dfrom AND r.dto
),
tx AS (
  SELECT creator_id, user_id, created_at AS t, CAST(amount AS FLOAT64) AS amount
  FROM \`${refs.attributed}\`
  WHERE creator_id IN (${IDS}) AND type = 'message'
    AND calendar_date BETWEEN ${day(range.from)} AND DATE_ADD(${day(range.to)}, INTERVAL ${Math.ceil(UNLOCK_WINDOW_H / 24) + 1} DAY)
),
per_fan AS (
  SELECT t.creator_id, t.user_id, t.d, t.manual, t.rule_id, t.price,
    LOGICAL_OR(x.t IS NOT NULL) AS unlocked
  FROM tagged t
  LEFT JOIN tx x ON t.price IS NOT NULL AND x.creator_id = t.creator_id AND x.user_id = t.user_id
    AND ABS(x.amount - t.price) < 0.005
    AND x.t >= t.sub_at AND x.t <= TIMESTAMP_ADD(t.sub_at, INTERVAL ${UNLOCK_WINDOW_H} HOUR)
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT creator_id, FORMAT_DATE('%Y-%m-%d', d) AS day, price, manual, rule_id,
  COUNT(*) AS subs, COUNTIF(unlocked) AS unlocks
FROM per_fan
GROUP BY creator_id, d, price, manual, rule_id`;
}
