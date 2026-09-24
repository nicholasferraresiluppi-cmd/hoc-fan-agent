// Coaching vendite — SQL (puro: nessun import, così lo usano sia la lib sia gli
// script di collaudo in node).
//
// COSA MISURA. Ogni PPV mandato A MANO in chat (esclusi mass/coda) nelle ultime
// WEEKS settimane chiuse, con: chi lo ha mandato (solo se era l'unico chatter in
// turno su quella creator), il contesto dell'ora prima (chat viva, bonus,
// ancoraggio, obiezione del fan…), se il fan aveva già pagato, e se il PPV è
// stato comprato entro 72h (stesso fan, stesso importo, tipo "message").
//
// TRAPPOLE DATI (misurate set 2026, non rimuovere le difese):
//   - ws_chat ha ~9% di righe duplicate per `id` → dedup per id. Senza, il
//     doppione "eredita" l'acquisto e produce effetti enormi e finti.
//   - il PPV di BENVENUTO (fan che non ha ancora scritto, entro 30' dal primo
//     contatto) è ~37% dei PPV ed è automatico → flag `welcome`, escluso dalla
//     valutazione di operatori e comportamenti.
//   - role_names in cache_members = "HOC - Chatter" (con spazi) → REPLACE.
//   - la finestra si chiude 3 giorni fa: il PPV più recente ha avuto le sue 72h.
//
// COSTO. Il client gira con scope OAuth READ-ONLY → niente script/temp table.
// Una CTE referenziata due volte viene ricalcolata (= ws_chat scansionata due
// volte), quindi la pipeline è LINEARE: ogni CTE derivata da ws_chat è letta
// una sola volta, e le uscite (agg/lift/cand) escono da un unico GROUP BY su
// UNNEST di "specifiche". Il contesto dell'ora prima si calcola con finestre
// RANGE (niente self-join).
//
// OUTPUT (colonna `kind`):
//   'agg'  → settimana × creator × operatore × welcome × già-pagante (somme)
//   'lift' → comportamento × cella (creator × già-pagante × ordine PPV) × sì/no
//   'cand' → singole vendite candidate a esempio (fan mai pagante, comprato,
//            chat viva, bonus/ancoraggio/obiezione, operatore singolo)

export const WEEKS = 8;

const TECH_BONUS = `r'regal|in più|in piu|omaggio|bonus|ti mando anche|ti aggiungo|extra'`;
const TECH_ANCHOR = `r'verrebbe|di solito|normalmente|prezzo pieno|invece di|anziché|anziche|sconto|scontat|sotto al minimo|prezzo speciale|solo per te a'`;
const OBJECTION = `r'non ho soldi|non posso pagare|troppo|caro|costa|sconto|gratis|gratuito'`;

// Finestra come COSTANTI letterali (non sub-select): solo così BigQuery pota
// le partizioni di ws_chat già nella stima — con i sub-select la stima era
// l'intera tabella e il fusibile maximumBytesBilled diventava inutile.
// t1 = lunedì della settimana di (oggi − 3 giorni); t0 = t1 − weeks settimane.
export function windowBounds(now = new Date(), weeks = WEEKS) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3));
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

export function salesCoachingSQL({ dataProject, orgId, weeks = WEEKS, now = new Date() }) {
  const D = dataProject;
  const { t0, t1 } = windowBounds(now, weeks);
  const W60 = `(PARTITION BY creator_id, user_id ORDER BY UNIX_SECONDS(created_at) RANGE BETWEEN 3600 PRECEDING AND 1 PRECEDING)`;
  return `
WITH bounds AS (SELECT ${lit(t0)} AS t0, ${lit(t1)} AS t1),
ids AS (SELECT DISTINCT creator_id FROM \`${D}.onlyfans.reach\` WHERE organization_id = '${orgId}'),
d AS (
  SELECT c.creator_id, c.user_id, c.created_at, c.sender_id = c.creator_id AS out_,
         SAFE_CAST(JSON_VALUE(c.body, '$.price') AS FLOAT64) AS price,
         LOWER(REGEXP_REPLACE(JSON_VALUE(c.body, '$.text'), r'<[^>]+>', ' ')) AS txt
  FROM \`${D}.hoc.ws_chat\` c
  WHERE c.creator_id IN (SELECT creator_id FROM ids)
    AND c.created_at >= ${lit(t0, -2)}
    AND c.created_at < ${lit(t1)}
    AND COALESCE(JSON_VALUE(c.body, '$.isFromQueue'), 'false') != 'true'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY c.commit_timestamp) = 1
),
w AS (
  SELECT creator_id, user_id, created_at, out_, price,
    COUNTIF(NOT out_) OVER cum - IF(NOT out_, 1, 0) AS fan_before,
    COUNTIF(out_ AND price > 0) OVER cum AS ppv_k,
    MIN(created_at) OVER (PARTITION BY creator_id, user_id) AS first_seen,
    COUNTIF(NOT out_) OVER ${W60} AS fan_msgs_60,
    MAX(IF(out_ AND REGEXP_CONTAINS(txt, ${TECH_BONUS}), 1, 0)) OVER ${W60} AS bonus60,
    MAX(IF(out_ AND REGEXP_CONTAINS(txt, ${TECH_ANCHOR}), 1, 0)) OVER ${W60} AS anchor60,
    MAX(IF(NOT out_ AND REGEXP_CONTAINS(txt, ${OBJECTION}), 1, 0)) OVER ${W60} AS obj60,
    COUNTIF(out_ AND STRPOS(txt, '?') > 0) OVER ${W60} AS q60,
    COUNTIF(out_) OVER ${W60} AS o60
  FROM d
  WINDOW cum AS (PARTITION BY creator_id, user_id ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
),
p AS (
  SELECT w.creator_id, w.user_id, w.created_at, w.price,
    (w.fan_before = 0 AND TIMESTAMP_DIFF(w.created_at, w.first_seen, MINUTE) <= 30) AS welcome,
    CASE WHEN w.ppv_k = 1 THEN '1' WHEN w.ppv_k <= 3 THEN '2-3' ELSE '4+' END AS kb,
    w.fan_msgs_60 >= 3 AS live, w.fan_msgs_60 = 0 AS dead,
    w.bonus60 = 1 AS bonus, w.anchor60 = 1 AS anchor, w.obj60 = 1 AS objection,
    COALESCE(SAFE_DIVIDE(w.q60, w.o60) >= 0.3, FALSE) AS q_hi
  FROM w, bounds b
  WHERE w.out_ AND w.price > 0 AND w.created_at >= b.t0 AND w.created_at < b.t1
),
tx AS (
  SELECT creator_id, user_id, created_at, type, CAST(amount AS FLOAT64) AS amount, CAST(net AS FLOAT64) AS net
  FROM \`${D}.onlyfans.attributed_transactions\`
  WHERE creator_id IN (SELECT creator_id FROM ids)
),
fp AS (SELECT creator_id, user_id, MIN(created_at) AS first_pay FROM tx GROUP BY 1, 2),
p_fp AS (
  SELECT p.*, (fp.first_pay IS NOT NULL AND fp.first_pay < p.created_at) AS prior
  FROM p LEFT JOIN fp ON fp.creator_id = p.creator_id AND fp.user_id = p.user_id
),
p_bt AS (
  SELECT p_fp.creator_id, p_fp.user_id, p_fp.created_at,
    ANY_VALUE(p_fp.price) AS price, ANY_VALUE(p_fp.welcome) AS welcome, ANY_VALUE(p_fp.kb) AS kb,
    ANY_VALUE(p_fp.live) AS live, ANY_VALUE(p_fp.dead) AS dead, ANY_VALUE(p_fp.bonus) AS bonus,
    ANY_VALUE(p_fp.anchor) AS anchor, ANY_VALUE(p_fp.objection) AS objection, ANY_VALUE(p_fp.q_hi) AS q_hi,
    ANY_VALUE(p_fp.prior) AS prior,
    COUNT(t.user_id) > 0 AS bought, COALESCE(MAX(t.net), 0) AS net
  FROM p_fp LEFT JOIN tx t
    ON t.creator_id = p_fp.creator_id AND t.user_id = p_fp.user_id AND t.type = 'message'
   AND ABS(t.amount - p_fp.price) < 0.01
   AND t.created_at BETWEEN p_fp.created_at AND TIMESTAMP_ADD(p_fp.created_at, INTERVAL 72 HOUR)
  GROUP BY 1, 2, 3
),
sh AS (
  SELECT DISTINCT member_name, creator_id, started_at, ended_at
  FROM \`${D}.onlyfans.cache_members\`, UNNEST(role_names) r
  WHERE creator_id IN (SELECT creator_id FROM ids)
    AND started_at >= ${lit(t0, -1)}
    AND ended_at > started_at AND REPLACE(r, ' ', '') IN ('HOC-Chatter', 'Chatter')
),
p_op AS (
  SELECT p_bt.creator_id, p_bt.user_id, p_bt.created_at,
    ANY_VALUE(p_bt.price) AS price, ANY_VALUE(p_bt.welcome) AS welcome, ANY_VALUE(p_bt.kb) AS kb,
    ANY_VALUE(p_bt.live) AS live, ANY_VALUE(p_bt.dead) AS dead, ANY_VALUE(p_bt.bonus) AS bonus,
    ANY_VALUE(p_bt.anchor) AS anchor, ANY_VALUE(p_bt.objection) AS objection, ANY_VALUE(p_bt.q_hi) AS q_hi,
    ANY_VALUE(p_bt.prior) AS prior, ANY_VALUE(p_bt.bought) AS bought, ANY_VALUE(p_bt.net) AS net,
    CASE COUNT(DISTINCT sh.member_name) WHEN 1 THEN ANY_VALUE(sh.member_name) WHEN 0 THEN '(nessun turno)' ELSE '(duo)' END AS op
  FROM p_bt LEFT JOIN sh ON sh.creator_id = p_bt.creator_id AND p_bt.created_at >= sh.started_at AND p_bt.created_at < sh.ended_at
  GROUP BY 1, 2, 3
),
fe AS (
  SELECT p_op.*,
    CAST(DATE(TIMESTAMP_TRUNC(created_at, WEEK(MONDAY))) AS STRING) AS wk,
    AVG(IF(bought, 1, 0)) OVER cell AS e_buy, AVG(net) OVER cell AS e_net
  FROM p_op
  WINDOW cell AS (PARTITION BY welcome, creator_id, prior, kb)
)
SELECT s.kind,
  IF(s.kind = 'lift', NULL, wk) AS wk,
  creator_id,
  IF(s.kind = 'lift', NULL, op) AS op,
  IF(s.kind = 'agg', welcome, NULL) AS welcome,
  prior,
  s.feature, s.fval,
  IF(s.kind = 'agg', NULL, kb) AS kb,
  IF(s.kind = 'cand', CAST(user_id AS STRING), NULL) AS uid,
  IF(s.kind = 'cand', FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', created_at), NULL) AS ts,
  IF(s.kind = 'cand', ANY_VALUE(price), NULL) AS price,
  COUNT(*) AS n, COUNTIF(bought) AS buys, ROUND(SUM(net), 2) AS net,
  ROUND(SUM(e_buy), 4) AS e_buy, ROUND(SUM(e_net), 2) AS e_net,
  COUNTIF(live) AS live_n, COUNTIF(live AND bought) AS live_buys,
  COUNTIF(dead) AS dead_n, COUNTIF(dead AND bought) AS dead_buys,
  COUNTIF(bonus OR anchor) AS tech_n, COUNTIF((bonus OR anchor) AND bought) AS tech_buys
FROM fe, UNNEST([
  STRUCT('agg' AS kind, CAST(NULL AS STRING) AS feature, CAST(NULL AS BOOL) AS fval),
  ('lift', 'live', live), ('lift', 'dead', dead), ('lift', 'bonus', bonus),
  ('lift', 'anchor', anchor), ('lift', 'objection', objection), ('lift', 'q_hi', q_hi),
  ('cand', NULL, NULL)
]) s
WHERE s.kind = 'agg'
   OR (s.kind = 'lift' AND NOT welcome)
   OR (s.kind = 'cand' AND NOT welcome AND NOT prior AND bought AND live AND (bonus OR anchor OR objection)
       AND NOT STARTS_WITH(op, '('))
GROUP BY s.kind, wk, creator_id, op, welcome, prior, s.feature, s.fval, kb, uid, ts
`;
}

// Seconda query, leggera: i messaggi attorno alle vendite scelte come esempio.
// ws_chat è clusterizzata per creator_id,user_id → legge poco. Il nome e lo
// username del fan vengono oscurati QUI (prima che il testo lasci il warehouse).
// `picks` = [{creator_id, uid, ts}] già validati (interi / ISO) dal chiamante.
export function exampleMessagesSQL({ dataProject, picks }) {
  const D = dataProject;
  const rows = picks
    .map((p) => `STRUCT(${Number(p.creator_id)} AS creator_id, ${Number(p.uid)} AS user_id, TIMESTAMP('${String(p.ts).replace(/[^0-9TZ:\-.]/g, "")}') AS t)`)
    .join(",\n  ");
  const cids = [...new Set(picks.map((p) => Number(p.creator_id)))].join(",");
  // un intervallo LETTERALE per ogni esempio (±1h): pota le partizioni e
  // soprattutto evita di leggere user_data (JSON pesante) su settimane intere
  const ranges = picks
    .map((p) => {
      const t = Date.parse(p.ts);
      const a = new Date(t - 3600e3).toISOString(), b = new Date(t + 3600e3).toISOString();
      return `(c.created_at BETWEEN TIMESTAMP('${a}') AND TIMESTAMP('${b}'))`;
    })
    .join(" OR ");
  const uids = [...new Set(picks.map((p) => Number(p.uid)))].join(",");
  return `
WITH k AS (SELECT * FROM UNNEST([
  ${rows}
])),
m AS (
  SELECT c.creator_id, c.user_id, c.created_at, c.sender_id = c.creator_id AS out_,
         SAFE_CAST(JSON_VALUE(c.body, '$.price') AS FLOAT64) AS price,
         REGEXP_REPLACE(JSON_VALUE(c.body, '$.text'), r'<[^>]+>', ' ') AS txt,
         LOWER(SPLIT(TRIM(JSON_VALUE(c.user_data, '$.name')), ' ')[SAFE_OFFSET(0)]) AS fan_first,
         LOWER(JSON_VALUE(c.user_data, '$.username')) AS fan_user
  FROM \`${D}.hoc.ws_chat\` c
  WHERE c.creator_id IN (${cids}) AND c.user_id IN (${uids})
    AND (${ranges})
    AND COALESCE(JSON_VALUE(c.body, '$.isFromQueue'), 'false') != 'true'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY c.commit_timestamp) = 1
),
names AS (
  SELECT creator_id, user_id,
    ANY_VALUE(IF(REGEXP_CONTAINS(COALESCE(fan_first, ''), r'^[a-zà-ÿ]{3,}$'), fan_first, NULL)) AS fn,
    ANY_VALUE(IF(REGEXP_CONTAINS(COALESCE(fan_user, ''), r'^[a-z0-9_.]{3,}$'), fan_user, NULL)) AS fu
  FROM m GROUP BY 1, 2
)
SELECT k.creator_id, CAST(k.user_id AS STRING) AS uid, FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', k.t) AS ts,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', m.created_at) AS msg_at, m.out_, m.price,
  SUBSTR(
    (SELECT IF(nm.fn IS NULL, t2, REGEXP_REPLACE(t2, CONCAT('(?i)\\\\b', nm.fn, '\\\\b'), '[nome]'))
     FROM (SELECT IF(nm.fu IS NULL, COALESCE(m.txt, ''), REGEXP_REPLACE(COALESCE(m.txt, ''), CONCAT('(?i)@?', REPLACE(nm.fu, '.', '[.]')), '[fan]')) AS t2)),
    1, 400) AS txt
FROM k
JOIN m ON m.creator_id = k.creator_id AND m.user_id = k.user_id
 AND m.created_at BETWEEN TIMESTAMP_SUB(k.t, INTERVAL 40 MINUTE) AND TIMESTAMP_ADD(k.t, INTERVAL 15 MINUTE)
LEFT JOIN names nm ON nm.creator_id = k.creator_id AND nm.user_id = k.user_id
ORDER BY k.creator_id, uid, ts, msg_at
`;
}
