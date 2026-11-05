// La scaletta — SQL (puro: nessun import, così lo usano sia la lib sia i test in node).
//
// COSA MISURA (nato dal caso di studio Martina Scavo, 16/10/2026). Nel sexting si vende a
// "scaletta": il fan sblocca un contenuto, la scena continua, arriva il contenuto dopo a un
// prezzo più alto. Qui si misura, per conversazione:
//   - se c'è stata almeno una proposta (PPV mandato a mano) e se ha venduto
//   - se dopo il 1° acquisto è arrivata un'altra proposta (la scaletta continua)
//   - quanti gradini sono stati comprati e a che prezzo (1°, 2°, 3°)
//   - se prima della 1ª proposta è partito un contenuto gratis (riscaldamento)
//   - quando la scaletta si ferma, cosa succede dopo l'acquisto (motivo)
//   - l'operatore, solo se era l'unico chatter in turno su quella creator
//
// DEFINIZIONI (le stesse del caso di studio, non cambiarle senza versionare):
//   conversazione = messaggi tra creator e fan senza pause di più di 60 minuti
//   proposta      = messaggio a pagamento NON da coda/mass, NON di benvenuto (fan che non ha
//                   ancora scritto, entro 30' dal primo contatto), NON automatico (stesso testo
//                   mandato a 20+ fan nello stesso giorno)
//   acquisto      = transazione "message" dello stesso importo entro 24h, assegnata alla
//                   proposta più recente con quel prezzo (una transazione = un acquisto)
//
// TRAPPOLE DATI (misurate, non rimuovere le difese): ws_chat ha ~9% di righe duplicate per id
// (dedup per id); role_names in cache_members con spazi ("HOC - Chatter").
//
// COSTO. Scope OAuth read-only → niente temp table. Una CTE letta due volte viene ricalcolata
// (= ws_chat scansionata due volte), quindi la pipeline è LINEARE: messaggi e transazioni
// scorrono in UN solo flusso (UNION ALL) e l'abbinamento acquisto→proposta si fa con una
// finestra sullo stesso flusso, senza self-join.
//
// OUTPUT: righe aggregate settimana × creator × operatore × coinvolgimento × riscaldamento.

export const WEEKS = 8;

// Parole del fan DOPO l'acquisto (motivo per cui la scaletta si ferma). Ordine di priorità
// identico al caso di studio: concluso → soldi → deve andare → sparisce → senza risposta → resta.
export const RX_FINISHED = `r'\\bvenut|sborr|godut|\\bfinito|ho finito|sono esplos|mi hai fatto venire|\\bcum\\b|\\bcame\\b'`;
export const RX_MONEY = `r'soldi|non posso|carta|budget|stipendi|\\bcaro\\b|costa|non ho più|ricaric|povero|euro|spes[oa]'`;
export const RX_LEAVING = `r'devo andare|vado a|lavoro|domani|\\bdopo\\b|più tardi|piu tardi|dormi|buonanotte|notte|scapp|ci sentiamo|a dopo'`;
export const RX_ASKS = `r'quanto (costa|viene|vuoi)|ne hai (altr|un altr)|altro video|altri video|mandamel|voglio vedere|fammi vedere|me lo mandi|lo prendo|lo voglio|how much|send (it|me)|another one|more videos|un altro regalino'`;

// Finestra come COSTANTI letterali: solo così BigQuery pota le partizioni di ws_chat nella stima.
// t1 = lunedì della settimana di (oggi − 2 giorni): l'ultima proposta ha avuto le sue 24h.
export function windowBounds(now = new Date(), weeks = WEEKS) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const t1 = d.toISOString().slice(0, 10);
  const t0d = new Date(d);
  t0d.setUTCDate(t0d.getUTCDate() - 7 * weeks);
  return { t0: t0d.toISOString().slice(0, 10), t1 };
}

const lit = (day, addDays = 0) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + addDays);
  return `TIMESTAMP('${d.toISOString().slice(0, 10)}')`;
};

export function scalettaSQL({ dataProject, orgId, weeks = WEEKS, now = new Date() }) {
  const D = dataProject;
  const { t0, t1 } = windowBounds(now, weeks);
  const CU = `PARTITION BY creator_id, user_id`;
  return `
WITH ids AS (SELECT DISTINCT creator_id FROM \`${D}.onlyfans.reach\` WHERE organization_id = '${orgId}'),
d AS (
  SELECT c.creator_id, c.user_id, c.created_at, c.sender_id = c.creator_id AS out_,
    COALESCE(SAFE_CAST(JSON_VALUE(c.body, '$.price') AS FLOAT64), 0) AS price,
    (SELECT COUNTIF(JSON_VALUE(x, '$.type') IN ('video', 'gif')) FROM UNNEST(JSON_QUERY_ARRAY(c.body, '$.media')) x) AS n_video,
    COALESCE(SAFE_CAST(JSON_VALUE(c.body, '$.mediaCount') AS INT64), 0) AS media_n,
    LOWER(REGEXP_REPLACE(COALESCE(JSON_VALUE(c.body, '$.text'), ''), r'<[^>]+>', ' ')) AS txt
  FROM \`${D}.hoc.ws_chat\` c
  WHERE c.creator_id IN (SELECT creator_id FROM ids)
    AND c.created_at >= ${lit(t0, -1)} AND c.created_at < ${lit(t1, 1)}
    AND COALESCE(JSON_VALUE(c.body, '$.isFromQueue'), 'false') != 'true'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY c.commit_timestamp) = 1
),
w AS (
  SELECT d.*,
    COUNTIF(NOT out_) OVER (${CU} ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) - IF(NOT out_, 1, 0) AS fan_before,
    MIN(created_at) OVER (${CU}) AS first_seen,
    IF(out_ AND LENGTH(TRIM(txt)) > 0,
       COUNT(*) OVER (PARTITION BY creator_id, DATE(created_at), out_, IF(out_ AND LENGTH(TRIM(txt)) > 0, FARM_FINGERPRINT(txt), NULL)), 0) AS same_text_day,
    TIMESTAMP_DIFF(created_at, LAG(created_at) OVER (${CU} ORDER BY created_at), MINUTE) AS gap_min
  FROM d
),
x AS (
  SELECT creator_id, user_id, created_at, out_, price, n_video, txt,
    (out_ AND price > 0 AND same_text_day < 20
       AND NOT (fan_before = 0 AND TIMESTAMP_DIFF(created_at, first_seen, MINUTE) <= 30)) AS is_ppv,
    (out_ AND price = 0 AND media_n > 0 AND same_text_day < 20) AS is_free,
    SUM(IF(gap_min IS NULL OR gap_min > 60, 1, 0)) OVER (${CU} ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS sess
  FROM w
),
tx AS (
  SELECT creator_id, user_id, created_at, CAST(amount AS FLOAT64) AS amount
  FROM \`${D}.onlyfans.attributed_transactions\`
  WHERE creator_id IN (SELECT creator_id FROM ids) AND type = 'message'
    AND created_at >= ${lit(t0, -1)} AND created_at < ${lit(t1, 2)}
),
-- un solo flusso messaggi + transazioni (k: 0 = messaggio, 1 = transazione)
s AS (
  SELECT creator_id, user_id, created_at, 0 AS k, out_, price, n_video, txt, is_ppv, is_free, sess FROM x
  UNION ALL
  SELECT creator_id, user_id, created_at, 1, NULL, amount, NULL, NULL, FALSE, FALSE, NULL FROM tx
),
-- per ogni transazione: la proposta più recente con lo stesso prezzo (entro 24h) e la conversazione in cui cade
m AS (
  SELECT s.*,
    LAST_VALUE(IF(k = 0, sess, NULL) IGNORE NULLS) OVER (${CU} ORDER BY created_at, k ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS sess2,
    LAST_VALUE(IF(k = 0 AND is_ppv, STRUCT(created_at AS t, n_video > 0 AS vid, sess AS ps), NULL) IGNORE NULLS)
      OVER (PARTITION BY creator_id, user_id, CAST(ROUND(price * 100) AS INT64) ORDER BY created_at, k ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS mp
  FROM s
),
-- l'acquisto conta nella conversazione della PROPOSTA (anche se il fan paga un'ora dopo)
b0 AS (
  SELECT creator_id, user_id, created_at, k, out_, price, txt, is_ppv, is_free,
    IF(k = 0, sess2, mp.ps) AS sess,
    (k = 1 AND mp.t IS NOT NULL AND TIMESTAMP_DIFF(created_at, mp.t, MINUTE) <= 1440) AS buy,
    IF(k = 1, mp.vid, NULL) AS buy_vid,
    IF(k = 1, mp.t, NULL) AS buy_ppv_t
  FROM m
),
b AS (SELECT * FROM b0 WHERE k = 0 OR buy),
-- un acquisto per proposta (due transazioni sulla stessa proposta = una)
b2 AS (
  SELECT b.*,
    IF(buy, ROW_NUMBER() OVER (PARTITION BY creator_id, user_id, buy, buy_ppv_t ORDER BY created_at) = 1, FALSE) AS buy1
  FROM b
),
f AS (
  SELECT b2.*,
    MIN(IF(buy1, created_at, NULL)) OVER (PARTITION BY creator_id, user_id, sess) AS first_buy,
    MIN(IF(is_ppv, created_at, NULL)) OVER (PARTITION BY creator_id, user_id, sess) AS first_ppv
  FROM b2
),
cs AS (
  SELECT creator_id, user_id, sess,
    MIN(created_at) AS t_start,
    ANY_VALUE(first_ppv) AS first_ppv,
    ANY_VALUE(first_buy) AS first_buy,
    COUNTIF(k = 0 AND NOT out_) AS fan_msgs,
    COUNTIF(is_free AND created_at < first_ppv) > 0 AS warm,
    COUNTIF(buy1) AS n_buy,
    SUM(IF(buy1, price, 0)) AS rev,
    ARRAY_AGG(IF(buy1, price, NULL) IGNORE NULLS ORDER BY created_at LIMIT 3) AS prices,
    LOGICAL_AND(IF(buy1, buy_vid, NULL)) AS all_video,
    COUNTIF(is_ppv AND created_at > first_buy) > 0 AS cont,
    COUNTIF(k = 0 AND NOT out_ AND created_at > first_buy) AS fan_after,
    COUNTIF(is_free AND created_at > first_buy) > 0 AS gift_after,
    ARRAY_AGG(IF(k = 0, out_, NULL) IGNORE NULLS ORDER BY created_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS last_out,
    STRING_AGG(IF(k = 0 AND NOT out_ AND created_at > first_buy, txt, NULL), ' ') AS fan_txt_after
  FROM f
  GROUP BY 1, 2, 3
  HAVING first_ppv IS NOT NULL AND first_ppv >= ${lit(t0)} AND first_ppv < ${lit(t1)}
),
sh AS (
  SELECT DISTINCT member_name, creator_id, started_at, ended_at
  FROM \`${D}.onlyfans.cache_members\`, UNNEST(role_names) r
  WHERE creator_id IN (SELECT creator_id FROM ids)
    AND started_at >= ${lit(t0, -2)}
    AND ended_at > started_at AND REPLACE(r, ' ', '') IN ('HOC-Chatter', 'Chatter')
),
co AS (
  SELECT cs.creator_id, cs.user_id, cs.sess,
    CASE COUNT(DISTINCT sh.member_name) WHEN 1 THEN ANY_VALUE(sh.member_name) WHEN 0 THEN '(nessun turno)' ELSE '(duo)' END AS op
  FROM cs LEFT JOIN sh ON sh.creator_id = cs.creator_id AND cs.first_ppv >= sh.started_at AND cs.first_ppv < sh.ended_at
  GROUP BY 1, 2, 3
),
r AS (
  SELECT cs.*, co.op,
    CASE WHEN fan_msgs <= 2 THEN '0-2' WHEN fan_msgs <= 6 THEN '3-6' WHEN fan_msgs <= 15 THEN '7-15' ELSE '16+' END AS eng,
    n_buy > 0 AND NOT cont AS stopped,
    CASE
      WHEN NOT (n_buy > 0 AND NOT cont) THEN NULL
      WHEN REGEXP_CONTAINS(COALESCE(fan_txt_after, ''), ${RX_FINISHED}) THEN 'fin'
      WHEN REGEXP_CONTAINS(COALESCE(fan_txt_after, ''), ${RX_MONEY}) THEN 'money'
      WHEN REGEXP_CONTAINS(COALESCE(fan_txt_after, ''), ${RX_LEAVING}) THEN 'go'
      WHEN fan_after = 0 THEN 'gone'
      WHEN last_out = FALSE THEN 'noreply'
      ELSE 'chat'
    END AS why,
    REGEXP_CONTAINS(COALESCE(fan_txt_after, ''), ${RX_ASKS}) AS asks
  FROM cs JOIN co USING (creator_id, user_id, sess)
)
SELECT
  CAST(DATE(TIMESTAMP_TRUNC(first_ppv, WEEK(MONDAY))) AS STRING) AS wk,
  creator_id, op, eng, warm,
  COUNT(*) AS n,
  COUNTIF(n_buy > 0) AS sold,
  COUNTIF(n_buy > 0 AND cont) AS cont,
  COUNTIF(n_buy >= 2) AS b2,
  COUNTIF(n_buy >= 3) AS b3,
  ROUND(SUM(rev), 2) AS rev,
  ROUND(SUM(IF(ARRAY_LENGTH(prices) >= 3, prices[OFFSET(0)], 0)), 2) AS l1,
  ROUND(SUM(IF(ARRAY_LENGTH(prices) >= 3, prices[OFFSET(1)], 0)), 2) AS l2,
  ROUND(SUM(IF(ARRAY_LENGTH(prices) >= 3, prices[OFFSET(2)], 0)), 2) AS l3,
  ROUND(SUM(IF(ARRAY_LENGTH(prices) >= 2, prices[OFFSET(1)], 0)), 2) AS p2sum,
  COUNTIF(n_buy >= 2 AND all_video) AS b2vid,
  COUNTIF(why = 'fin') AS w_fin, COUNTIF(why = 'money') AS w_money, COUNTIF(why = 'go') AS w_go,
  COUNTIF(why = 'gone') AS w_gone, COUNTIF(why = 'noreply') AS w_noreply, COUNTIF(why = 'chat') AS w_chat,
  COUNTIF(stopped AND asks) AS w_asks, COUNTIF(stopped AND gift_after) AS w_gift
FROM r
GROUP BY 1, 2, 3, 4, 5
`;
}

// Mass: profilo per creator × settimana (+ bucket 'recent' = ultime 4 settimane chiuse).
// Piccola: postgres.public_mass_stats (~135 MB intera).
//   cheap  = 7+ contenuti a meno del 90% del prezzo solito della pagina (mediana su 12 settimane)
//   sconto = la parola nel testo (sconto/scontato/discount/descuento/"% off"/"NN%")
//   liste  = mandata a meno della metà dei destinatari abituali del mese (p90)
export function massSQL({ dataProject, orgId, weeks = WEEKS, now = new Date() }) {
  const D = dataProject;
  const { t1 } = windowBounds(now, weeks);
  const { t0: tRecent } = windowBounds(now, 4);
  const { t0: tLong } = windowBounds(now, 12);
  return `
WITH ids AS (SELECT DISTINCT creator_id FROM \`${D}.onlyfans.reach\` WHERE organization_id = '${orgId}'),
m0 AS (
  SELECT id, creator_id, date, LOWER(COALESCE(text, '')) AS txt, COALESCE(photos, 0) + COALESCE(videos, 0) AS nm,
    sent_count, CAST(COALESCE(price, 0) AS FLOAT64) AS price
  FROM \`${D}.postgres.public_mass_stats\`
  WHERE status = 'SENT' AND date >= ${lit(tLong)} AND date < ${lit(t1)} AND creator_id IN (SELECT creator_id FROM ids)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) = 1
),
m1 AS (
  SELECT m0.*,
    PERCENTILE_CONT(IF(price > 0, price, NULL), 0.5) OVER (PARTITION BY creator_id) AS usual,
    PERCENTILE_CONT(sent_count, 0.9) OVER (PARTITION BY creator_id, DATE_TRUNC(DATE(date), MONTH)) AS p90
  FROM m0
),
m2 AS (
  SELECT m1.*, b AS bucket FROM m1,
  UNNEST([CAST(DATE(TIMESTAMP_TRUNC(date, WEEK(MONDAY))) AS STRING), IF(date >= ${lit(tRecent)}, 'recent', NULL)]) b
  WHERE b IS NOT NULL
)
SELECT bucket AS wk, creator_id,
  COUNT(*) AS n, COUNTIF(price > 0) AS paid,
  APPROX_QUANTILES(IF(price > 0, price, NULL), 2)[OFFSET(1)] AS price_p50,
  APPROX_QUANTILES(IF(price > 0, price / GREATEST(nm, 1), NULL), 2)[OFFSET(1)] AS ppc_p50,
  COUNTIF(price > 0 AND nm >= 7 AND price < 0.9 * usual) AS cheap,
  COUNTIF(price > 0 AND REGEXP_CONTAINS(txt, r'sconto|scontat|discount|descuento|% off|\\d+ ?%')) AS sconto,
  COUNTIF(sent_count < 0.5 * p90) AS liste
FROM m2
GROUP BY 1, 2
`;
}

// Fan che pagano (qualunque tipo) per creator × settimana.
export function payersSQL({ dataProject, orgId, weeks = WEEKS, now = new Date() }) {
  const D = dataProject;
  const { t1 } = windowBounds(now, weeks);
  const { t0 } = windowBounds(now, Math.max(weeks, 12));
  return `
SELECT CAST(DATE_TRUNC(calendar_date, WEEK(MONDAY)) AS STRING) AS wk, creator_id,
  COUNT(DISTINCT IF(CAST(net AS FLOAT64) > 0, user_id, NULL)) AS payers,
  ROUND(SUM(CAST(net AS FLOAT64)), 2) AS net
FROM \`${D}.onlyfans.attributed_transactions\`
WHERE organization_id = '${orgId}' AND calendar_date >= DATE ${lit(t0).replace("TIMESTAMP", "")} AND calendar_date < DATE ${lit(t1).replace("TIMESTAMP", "")}
GROUP BY 1, 2
`;
}
