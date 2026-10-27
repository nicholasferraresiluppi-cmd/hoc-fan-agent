/**
 * Publisher X — query sul warehouse (27/10/2026), pure: tabella e organizzazione arrivano
 * da fuori (publisher-x.js), così si provano anche da riga di comando.
 * Fonte: hoc.newsubs_spending = una riga per nuova sub con link d'ingresso e spesa a 0/7/30 giorni.
 */
import { linkKey } from "./publisher-x-core.js";

const LOOKBACK_MONTHS = 6;
const X_RE = "(?i:^\\s*x\\s*$)|(^|[^A-Za-z0-9])X([^A-Za-z0-9]|$)|\\.x$|(?i:(^|[^a-z0-9])(twitter|tw)([^a-z0-9]|$))"; // stessa regola di isXLink

/** Stringa SQL sicura (BigQuery standard): niente parametri nel client REST, quindi si escapa. */
export const sqlStr = (s) => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
export const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ""));

function assignedFilter(links) {
  if (!links.length) return "FALSE";
  return `CONCAT(CAST(creator_id AS STRING), '|', link_name) IN (${links.map((l) => sqlStr(linkKey(l.creatorId, l.linkName))).join(", ")})`;
}

/**
 * Link X (riconosciuti dal nome) + link assegnati a mano: sub nuove del mese scelto e,
 * sugli ultimi 6 mesi, quanto spende in media una sub che ha chiuso i 30 giorni.
 */
export function linksSql({ table, org }, month, links) {
  return `
WITH base AS (
  SELECT creator_id, creator_name, link_name, link_url, sub_start_at, spend_d7, spend_d30,
    FORMAT_DATE('%Y-%m', DATE(sub_start_at, 'Europe/Rome')) AS m
  FROM ${table}
  WHERE organization_id = ${sqlStr(org)}
    AND is_first_sub
    AND link_name IS NOT NULL
    AND sub_start_at >= TIMESTAMP(DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL ${LOOKBACK_MONTHS} MONTH))
    AND (REGEXP_CONTAINS(link_name, r'${X_RE}') OR ${assignedFilter(links)})
), until AS (
  SELECT MAX(sub_start_at) AS t FROM ${table} WHERE organization_id = ${sqlStr(org)} AND sub_start_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 10 DAY)
)
SELECT creator_id, ANY_VALUE(creator_name) AS creator_name, link_name, ANY_VALUE(link_url) AS link_url,
  COUNTIF(m = ${sqlStr(month)}) AS subs_month,
  COUNT(*) AS subs_6m,
  COUNTIF(sub_start_at <= TIMESTAMP_SUB((SELECT t FROM until), INTERVAL 30 DAY)) AS mature_6m,
  AVG(IF(sub_start_at <= TIMESTAMP_SUB((SELECT t FROM until), INTERVAL 30 DAY), spend_d7, NULL)) AS avg_d7,
  AVG(IF(sub_start_at <= TIMESTAMP_SUB((SELECT t FROM until), INTERVAL 30 DAY), spend_d30, NULL)) AS avg_d30,
  MIN(DATE(sub_start_at, 'Europe/Rome')) AS first_day, MAX(DATE(sub_start_at, 'Europe/Rome')) AS last_day,
  ANY_VALUE((SELECT t FROM until)) AS data_until
FROM base
GROUP BY creator_id, link_name
HAVING subs_6m >= 3 OR ${assignedFilter(links)}
ORDER BY subs_month DESC, subs_6m DESC`;
}

/** I fan nuovi del mese entrati dai link assegnati, uno per riga. */
export function fansSql({ table, org }, month, links) {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return `
SELECT creator_id, creator_name, link_name, CAST(user_id AS STRING) AS user_id, username, sub_start_at,
  spend_d0, spend_d7, spend_d30
FROM ${table}
WHERE organization_id = ${sqlStr(org)}
  AND is_first_sub
  AND sub_start_at >= TIMESTAMP(${sqlStr(start)}, 'Europe/Rome')
  AND sub_start_at < TIMESTAMP(${sqlStr(next)}, 'Europe/Rome')
  AND ${assignedFilter(links)}
ORDER BY sub_start_at`;
}

/** Fin dove arrivano i dati: l'ultima sub registrata (il warehouse si aggiorna a ieri). */
export function untilSql({ table, org }) {
  return `SELECT MAX(sub_start_at) AS t FROM ${table} WHERE organization_id = ${sqlStr(org)} AND sub_start_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 10 DAY)`;
}
