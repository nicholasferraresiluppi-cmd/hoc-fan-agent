// Manuale vendite — misura di una prova su una creator (puro: nessun import).
//
// Stesse definizioni dello studio del manuale (docs fuori repo, 4/10/2026):
// - proposta = PPV dell'operatore, non in coda, non di massa (stesso testo ≥20
//   volte nella stessa ora), non benvenuto (= PPV mandato prima che il fan
//   abbia mai scritto, entro 1 ora dal primo contatto);
// - comprata = acquisto 'message' dello stesso importo entro 24 ore.
// Finestre come LETTERALI (pruning delle partizioni) e dedup di ws_chat per id.

const lit = (ms) => `TIMESTAMP('${new Date(ms).toISOString()}')`;

export function provaMetricsSQL({ dataProject: D, creatorId, from, to }) {
  const C = String(Number(creatorId));
  return `
WITH d AS (
  SELECT c.user_id, c.created_at, c.sender_id = c.creator_id AS out_,
    COALESCE(SAFE_CAST(JSON_VALUE(c.body,'$.price') AS FLOAT64),0) AS price,
    COALESCE(JSON_VALUE(c.body,'$.isFromQueue'),'false')='true' AS queued,
    LOWER(TRIM(REGEXP_REPLACE(COALESCE(JSON_VALUE(c.body,'$.text'),''), r'<[^>]+>', ' '))) AS txt
  FROM \`${D}.hoc.ws_chat\` c
  WHERE c.creator_id = ${C} AND c.created_at >= ${lit(from - 30 * 86400e3)} AND c.created_at < ${lit(to + 86400e3)}
  QUALIFY ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY c.commit_timestamp)=1
),
m AS (
  SELECT *,
    IF(out_ AND LENGTH(txt)>0, COUNT(*) OVER (PARTITION BY TIMESTAMP_TRUNC(created_at,HOUR), out_, txt), 0) AS same_h,
    MIN(created_at) OVER (PARTITION BY user_id) AS first_seen,
    MIN(IF(NOT out_, created_at, NULL)) OVER (PARTITION BY user_id) AS first_fan,
    MAX(IF(NOT out_, created_at, NULL)) OVER (PARTITION BY user_id ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS last_fan_at
  FROM d
),
tx AS (
  SELECT user_id, created_at, CAST(amount AS FLOAT64) amount
  FROM \`${D}.onlyfans.attributed_transactions\`
  WHERE creator_id = ${C} AND type='message' AND created_at >= ${lit(from - 60 * 86400e3)} AND created_at < ${lit(to + 86400e3)}
),
p0 AS (
  SELECT m.user_id, m.created_at, m.price, m.last_fan_at,
    NOT (m.created_at < COALESCE(m.first_fan, TIMESTAMP('2999-01-01')) AND m.created_at < TIMESTAMP_ADD(m.first_seen, INTERVAL 60 MINUTE)) AS personale
  FROM m WHERE m.out_ AND m.price>0 AND NOT m.queued AND m.same_h<20
),
p AS (
  SELECT p0.*,
    EXISTS(SELECT 1 FROM tx WHERE tx.user_id=p0.user_id AND ABS(tx.amount-p0.price)<0.01 AND tx.created_at BETWEEN p0.created_at AND TIMESTAMP_ADD(p0.created_at, INTERVAL 24 HOUR)) AS bought,
    EXISTS(SELECT 1 FROM tx WHERE tx.user_id=p0.user_id AND tx.created_at < p0.created_at) AS paid_before
  FROM p0 WHERE personale
),
q AS (
  SELECT *,
    LEAD(created_at) OVER (PARTITION BY user_id ORDER BY created_at) AS next_at,
    LEAD(price) OVER (PARTITION BY user_id ORDER BY created_at) AS next_price
  FROM p
),
w AS (SELECT * FROM q WHERE created_at >= ${lit(from)} AND created_at < ${lit(to)})
SELECT
  COUNT(*) AS proposte,
  COUNTIF(bought) AS comprate,
  COUNTIF(bought) AS acquisti,
  COUNTIF(bought AND next_at IS NOT NULL AND TIMESTAMP_DIFF(next_at, created_at, MINUTE) <= 60) AS seguito_dopo_acquisto,
  COUNTIF(NOT bought) AS rifiutate,
  COUNTIF(NOT bought AND next_at IS NOT NULL AND TIMESTAMP_DIFF(next_at, created_at, HOUR) <= 24) AS ripresa_dopo_no,
  COUNTIF(NOT bought AND next_at IS NOT NULL AND TIMESTAMP_DIFF(next_at, created_at, HOUR) <= 24 AND next_price < price) AS scende_dopo_no,
  APPROX_QUANTILES(price, 2)[OFFSET(1)] AS prezzo_mediano,
  APPROX_QUANTILES(IF(NOT paid_before, price, NULL), 2 IGNORE NULLS)[SAFE_OFFSET(1)] AS prezzo_mediano_mai_paganti,
  COUNTIF(last_fan_at IS NULL OR TIMESTAMP_DIFF(created_at, last_fan_at, MINUTE) > 60) AS a_fan_zitto
FROM w`;
}

/** Trasforma la riga grezza in metriche leggibili (percentuali 0-100). */
export function shapeMetrics(r) {
  if (!r) return null;
  const n = (x) => Number(x || 0);
  const pct = (a, b) => (n(b) > 0 ? Math.round((n(a) / n(b)) * 1000) / 10 : null);
  return {
    proposte: n(r.proposte),
    comprate_pct: pct(r.comprate, r.proposte),
    seguito_dopo_acquisto_pct: pct(r.seguito_dopo_acquisto, r.acquisti),
    ripresa_dopo_no_pct: pct(r.ripresa_dopo_no, r.rifiutate),
    scende_dopo_no_pct: pct(r.scende_dopo_no, r.ripresa_dopo_no),
    prezzo_mediano: r.prezzo_mediano == null ? null : n(r.prezzo_mediano),
    prezzo_mediano_mai_paganti: r.prezzo_mediano_mai_paganti == null ? null : n(r.prezzo_mediano_mai_paganti),
    a_fan_zitto_pct: pct(r.a_fan_zitto, r.proposte),
  };
}

export const METRICHE = [
  { key: "seguito_dopo_acquisto_pct", label: "Dopo un acquisto, nuova proposta entro 1 ora", unit: "%", meglio: "su", priorita: 1 },
  { key: "ripresa_dopo_no_pct", label: "Dopo un no, una nuova proposta entro 24 ore", unit: "%", meglio: "su", priorita: 2 },
  { key: "scende_dopo_no_pct", label: "…e quella nuova proposta costa meno", unit: "%", meglio: "su", priorita: 2 },
  { key: "comprate_pct", label: "Proposte comprate", unit: "%", meglio: "su", priorita: 3 },
  { key: "prezzo_mediano_mai_paganti", label: "Prezzo tipico a chi non ha mai comprato", unit: "$", meglio: "giu", priorita: 3 },
  { key: "prezzo_mediano", label: "Prezzo tipico di una proposta", unit: "$", meglio: null, priorita: null },
  { key: "a_fan_zitto_pct", label: "Proposte a fan zitti da più di un'ora", unit: "%", meglio: "giu", priorita: null },
  { key: "proposte", label: "Proposte personali", unit: "", meglio: null, priorita: null },
];

/** Settimane complete (lunedì-lunedì, ora di Roma approssimata a UTC+1/+2 lato chiamante) dalla data di avvio. */
export function weekWindows(startMs, nowMs, n = 8) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const from = startMs + i * 7 * 86400e3, to = from + 7 * 86400e3;
    if (to + 86400e3 > nowMs) break; // serve 1 giorno dopo per gli acquisti entro 24h
    out.push({ i: i + 1, from, to });
  }
  return out;
}
