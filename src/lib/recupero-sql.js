// Fan da recuperare (10/10/2026) — query. Logica pura: la usano lib/recupero.js e i test.
// `refs` = tabelle (warehouse o copia di sicurezza, le sceglie analisi-vendite.runOnSource).
//
// "Fan da recuperare" = ha speso almeno MIN_SPEND negli ultimi 60 giorni, l'ultimo acquisto è tra
// MIN_DAYS e MAX_DAYS fa (non ha più comprato). Non sappiamo se è ancora abbonato: nel warehouse
// `users_research.ended_at` è solo la data dell'ultimo aggiornamento (verificato 10/10: 5.672 su 5.696
// righe di Alessandra = oggi), quindi non si usa. Chi non è raggiungibile lo segna chi lavora la lista.

export const RECUPERO = {
  MIN_SPEND: 100, // $ negli ultimi 60 giorni
  MIN_DAYS: 7, // ultimo acquisto almeno 7 giorni fa…
  MAX_DAYS: 45, // …ma non oltre 45 (oltre, è un fan perso, non spento)
  PER_CREATOR: 12, // quanti fan per creator finiscono nella lista del giorno
  POOL: 30, // quanti candidati si leggono per creator (poi si tolgono quelli già lavorati)
  MSGS: 20, // ultimi messaggi letti per fan
  REBUY_DAYS: 7, // finestra per dire "ha ricomprato"
};

const ids = (list) => {
  const clean = [...new Set((list || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!clean.length) throw new Error("nessuna creator");
  return clean.join(",");
};
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

/** I candidati di ogni creator, ordinati per quanto valevano. `today` = giorno UTC del calcolo. */
export function candidatesSql(refs, creatorIds, today) {
  if (!isDay(today)) throw new Error("giorno non valido");
  const R = RECUPERO;
  return `
    WITH t AS (
      SELECT creator_id, user_id, SUM(net) AS spent60, COUNTIF(net > 0) AS buys60, MAX(calendar_date) AS last_buy
      FROM \`${refs.attributed}\`
      WHERE creator_id IN (${ids(creatorIds)}) AND user_id IS NOT NULL
        AND calendar_date BETWEEN DATE_SUB(DATE '${today}', INTERVAL 60 DAY) AND DATE_SUB(DATE '${today}', INTERVAL 1 DAY)
      GROUP BY 1, 2),
    c AS (
      SELECT * FROM t
      WHERE spent60 >= ${R.MIN_SPEND}
        AND last_buy BETWEEN DATE_SUB(DATE '${today}', INTERVAL ${R.MAX_DAYS} DAY) AND DATE_SUB(DATE '${today}', INTERVAL ${R.MIN_DAYS} DAY)
      QUALIFY ROW_NUMBER() OVER (PARTITION BY creator_id ORDER BY spent60 DESC) <= ${R.POOL}),
    m AS (
      SELECT ch.creator_id, ch.user_id,
        MAX(IF(ch.sender_id = ch.user_id, ch.created_at, NULL)) AS last_fan_msg,
        MAX(IF(ch.sender_id != ch.user_id, ch.created_at, NULL)) AS last_our_msg
      FROM \`${refs.chat}\` ch
      WHERE ch.creator_id IN (${ids(creatorIds)}) AND DATE(ch.created_at) >= DATE_SUB(DATE '${today}', INTERVAL 60 DAY)
        AND ch.user_id IN (SELECT user_id FROM c)
      GROUP BY 1, 2)
    SELECT c.creator_id, c.user_id, us.username, c.spent60, c.buys60, FORMAT_DATE('%Y-%m-%d', c.last_buy) AS last_buy,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', m.last_fan_msg) AS last_fan_msg, FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', m.last_our_msg) AS last_our_msg
    FROM c LEFT JOIN m USING (creator_id, user_id) LEFT JOIN \`${refs.users}\` us ON us.id = c.user_id
    ORDER BY c.creator_id, c.spent60 DESC`;
}

/** Le ultime chat dei fan scelti (ultimi 60 giorni, ultimi MSGS messaggi per fan). */
export function recuperoChatSql(refs, pairs, today) {
  const clean = pairs.map(([c, u]) => [Number(c), Number(u)]).filter(([c, u]) => Number.isInteger(c) && Number.isInteger(u) && c > 0 && u > 0);
  if (!clean.length) throw new Error("nessun fan");
  if (!isDay(today)) throw new Error("giorno non valido");
  const cids = [...new Set(clean.map(([c]) => c))].join(",");
  const keys = clean.map(([c, u]) => `'${c}:${u}'`).join(",");
  return `
    SELECT creator_id, user_id, FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', created_at) AS sent_at, sender_id = user_id AS from_fan,
      CAST(price AS FLOAT64) AS price,
      SUBSTR(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(text, r'<[^>]+>', ' '), r'\\s+', ' ')), 1, 180) AS text
    FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY creator_id, user_id ORDER BY created_at DESC) AS rn
      FROM \`${refs.chat}\`
      WHERE creator_id IN (${cids}) AND DATE(created_at) >= DATE_SUB(DATE '${today}', INTERVAL 60 DAY)
        AND CONCAT(CAST(creator_id AS STRING), ':', CAST(user_id AS STRING)) IN (${keys}))
    WHERE rn <= ${RECUPERO.MSGS}
    ORDER BY creator_id, user_id, created_at`;
}

/**
 * Il risultato: per ogni fan (creator, user, giorno da cui contare) quanto ha speso nei REBUY_DAYS giorni dopo.
 * rows: [{creator_id, user_id, from}] con `from` = giorno (YYYY-MM-DD) del contatto o della lista.
 */
export function rebuySql(refs, rows) {
  const clean = rows.filter((r) => Number(r.creator_id) > 0 && Number(r.user_id) > 0 && isDay(r.from));
  if (!clean.length) throw new Error("nessun fan");
  const cids = [...new Set(clean.map((r) => Number(r.creator_id)))].join(",");
  const values = clean.map((r) => `STRUCT(${Number(r.creator_id)} AS creator_id, ${Number(r.user_id)} AS user_id, DATE '${r.from}' AS d)`).join(", ");
  return `
    WITH p AS (SELECT * FROM UNNEST([${values}]))
    SELECT p.creator_id, p.user_id, FORMAT_DATE('%Y-%m-%d', p.d) AS from_day, IFNULL(SUM(t.net), 0) AS spent_after
    FROM p LEFT JOIN \`${refs.attributed}\` t
      ON t.creator_id = p.creator_id AND t.user_id = p.user_id AND t.calendar_date BETWEEN p.d AND DATE_ADD(p.d, INTERVAL ${RECUPERO.REBUY_DAYS - 1} DAY)
      AND t.creator_id IN (${cids})
    GROUP BY 1, 2, 3`;
}
