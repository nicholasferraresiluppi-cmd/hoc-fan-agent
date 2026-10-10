// Report Looker (10/10/2026) — query delle pagine copiate da Looker Studio che Analisi vendite non aveva.
// Logica pura (come analisi-vendite-sql.js): `refs` = tabelle della fonte, `ids` = creator già filtrati.
// Ogni funzione dichiara la pagina Looker che replica e cosa è stato verificato contro Looker.
//
// Regola del "% Δ" di Looker: si confronta col periodo precedente di pari durata, RIGA PER RIGA sulla
// stessa combinazione di dimensioni. Quando una dimensione è il mese (Clicks Overall), la riga
// "ott 2026" del periodo prima contiene solo i giorni di ottobre: da qui i +246% di Looker sui primi
// giorni del mese. Si replica com'è (chi arriva da Looker deve ritrovare gli stessi numeri).

import { previousRange, idList } from "./analisi-vendite-sql.js";

const d = (s) => `DATE '${s}'`;

/** Recap Dashboard — revenue (attributed_transactions.net) giorno per giorno per creator, per le linee. */
export function lkRecapDailyNetSql(refs, ids, range) {
  return `
    SELECT creator_id, FORMAT_DATE('%Y-%m-%d', calendar_date) AS day, SUM(net) AS v
    FROM \`${refs.attributed}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)}
    GROUP BY 1, 2`;
}

/** Recap Dashboard — nuovi abbonati (subscriptions.new_subs) giorno per giorno per creator. */
export function lkRecapDailySubsSql(refs, ids, range) {
  return `
    SELECT creator_id, FORMAT_DATE('%Y-%m-%d', calendar_date) AS day, SUM(new_subs) AS v
    FROM \`${refs.subscriptions}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)}
    GROUP BY 1, 2`;
}

/**
 * Clicks Overall ("Tracking Links Stats Overall") — onlyfans.links_stats per creator × mese:
 * clicks_diff, subs_diff, CR = subs/clicks, ognuno con % Δ sulla stessa riga del periodo prima.
 * Il totale confronta tutto il periodo con tutto il periodo prima.
 */
export function lkClicksSql(refs, ids, range) {
  const p = previousRange(range);
  return `
    WITH b AS (
      SELECT creator_id, FORMAT_DATE('%Y-%m', calendar_date) AS month, calendar_date >= ${d(range.from)} AS cur,
        SUM(clicks_diff) AS clicks, SUM(subs_diff) AS subs
      FROM \`${refs.linksStats}\`
      WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(p.from)} AND ${d(range.to)}
      GROUP BY 1, 2, 3)
    SELECT creator_id, month,
      SUM(IF(cur, clicks, 0)) AS clicks, SUM(IF(cur, 0, clicks)) AS clicks_prev,
      SUM(IF(cur, subs, 0)) AS subs, SUM(IF(cur, 0, subs)) AS subs_prev,
      LOGICAL_OR(cur) AS in_range
    FROM b GROUP BY 1, 2`;
}

/** Welcome mass unlocks — andamento giornaliero di subs_count e unlocks_count (le due linee di Looker). */
export function lkWelcomeDailySql(refs, ids, range) {
  return `
    SELECT FORMAT_DATE('%Y-%m-%d', calendar_date) AS day, SUM(subs_count) AS subs, SUM(unlocks_count) AS unlocks
    FROM \`${refs.welcomeUnlocks}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)}
    GROUP BY 1 ORDER BY 1`;
}

/**
 * Performance KPI per creators — onlyfans.transactions_analytics per creator: new_subs, num_transactions,
 * tot_revenue (senza abbonamenti), unique_users (spending users), revenue per transazione e per utente,
 * ognuno con % Δ sul periodo prima.
 */
export function lkPerfSql(refs, ids, range) {
  const p = previousRange(range);
  return `
    SELECT creator_id,
      SUM(IF(cur, new_subs, 0)) AS new_subs, SUM(IF(cur, 0, new_subs)) AS new_subs_prev,
      SUM(IF(cur, num_transactions, 0)) AS tx, SUM(IF(cur, 0, num_transactions)) AS tx_prev,
      SUM(IF(cur, tot_revenue, 0)) AS revenue, SUM(IF(cur, 0, tot_revenue)) AS revenue_prev,
      SUM(IF(cur, unique_users, 0)) AS users, SUM(IF(cur, 0, unique_users)) AS users_prev
    FROM (SELECT *, calendar_date >= ${d(range.from)} AS cur FROM \`${refs.transactionsAnalytics}\`
          WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(p.from)} AND ${d(range.to)})
    GROUP BY creator_id`;
}

/**
 * Performance KPI per creators (riquadri in basso) — hoc.days_subbed_range: spesa (senza abbonamenti) per
 * fascia di giorni dall'abbonamento ("1_0-15" …), ARPPU = revenue / utenti distinti, per fascia e per creator.
 * dim = "subscription_range" | "creator_id".
 */
export function lkSubsRangeSql(refs, ids, range, dim) {
  if (!["subscription_range", "creator_id"].includes(dim)) throw new Error("raggruppamento non valido");
  const p = previousRange(range);
  return `
    SELECT ${dim} AS k,
      SUM(IF(cur, revenue, 0)) AS revenue, SUM(IF(cur, 0, revenue)) AS revenue_prev,
      -- fan distinti per user_id (come Looker: verificato 26/9-9/10, 1_0-15 = 3.162 fan, ARPPU 64,71; totale 9.652, 62,76)
      COUNT(DISTINCT IF(cur, user_id, NULL)) AS users,
      COUNT(DISTINCT IF(cur, NULL, user_id)) AS users_prev
    FROM (SELECT *, calendar_date >= ${d(range.from)} AS cur FROM \`${refs.daysSubbed}\`
          WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(p.from)} AND ${d(range.to)})
    GROUP BY ROLLUP(k)`;
}

/** Performance KPI per creators — hoc.transactions_by_amount: numero di transazioni per fascia di importo. */
export function lkAmountRangeSql(refs, ids, range) {
  return `
    SELECT amount_range AS k, SUM(num_transactions) AS tx
    FROM \`${refs.txByAmount}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)}
    GROUP BY 1 ORDER BY 1`;
}

/**
 * Transactions Details — riquadri e grafici: net e spending users (utenti distinti) del periodo e del
 * periodo prima, LTV = net / spending users; net per ora del giorno e per giorno; i 100 fan che hanno
 * speso di più. Filtri opzionali come in Looker (link_name, user_id, type, spending_id).
 */
// Letterale di stringa BigQuery sicuro: prima le barre rovesciate, poi gli apici; niente a capo; max 120 caratteri.
export const sqlStr = (v) => `'${String(v).slice(0, 120).replace(/[\r\n]/g, " ").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const txFilter = (f = {}) => [
  f.link ? `AND link_name = ${sqlStr(f.link)}` : "",
  f.user ? `AND user_id = ${Math.trunc(Number(f.user)) || 0}` : "",
  f.type ? `AND type = '${String(f.type).replace(/[^a-z_]/g, "")}'` : "",
  f.spending ? `AND spending_id = ${sqlStr(f.spending)}` : "",
].join(" ");
export function lkTxSummarySql(refs, ids, range, f) {
  const p = previousRange(range);
  return `
    SELECT calendar_date >= ${d(range.from)} AS cur, SUM(net) AS net, COUNT(DISTINCT IF(net > 0, user_id, NULL)) AS users
    FROM \`${refs.attributed}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(p.from)} AND ${d(range.to)} ${txFilter(f)}
    GROUP BY 1`;
}
export function lkTxSeriesSql(refs, ids, range, f) {
  return `
    SELECT FORMAT_DATE('%Y-%m-%d', calendar_date) AS day, EXTRACT(HOUR FROM created_at) AS hour, SUM(net) AS net
    FROM \`${refs.attributed}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)} ${txFilter(f)}
    GROUP BY 1, 2`;
}
export function lkTxTopUsersSql(refs, ids, range, f) {
  return `
    SELECT creator_id, user_id, SUM(net) AS net
    FROM \`${refs.attributed}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)} AND user_id IS NOT NULL ${txFilter(f)}
    GROUP BY 1, 2 ORDER BY net DESC LIMIT 100`;
}
export function lkTxListSql(refs, ids, range, f) {
  return `
    SELECT FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at, creator_id, user_id,
      FORMAT_DATE('%Y-%m-%d', started_calendar_date) AS subscribed_on, link_name, spending_id, type,
      CAST(net AS FLOAT64) AS net, CAST(amount AS FLOAT64) AS amount
    FROM \`${refs.attributed}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)} ${txFilter(f)}
    ORDER BY created_at DESC LIMIT 1000`;
}

/** User research — gli abbonamenti iniziati nel periodo (onlyfans.users_research), filtrabili per id o username. */
export function lkUsersSql(refs, ids, range, f = {}) {
  const u = f.username ? `AND STARTS_WITH(LOWER(username), '${String(f.username).toLowerCase().replace(/[^a-z0-9._-]/g, "")}')` : "";
  const id = f.user ? `AND user_id = ${Math.trunc(Number(f.user)) || 0}` : "";
  return `
    SELECT creator_id, user_id, username, name, FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', started_at) AS started_at,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', ended_at) AS ended_at, spending_id, link_name,
      CAST(total_net_expenses AS FLOAT64) AS spent, transaction_count AS transactions
    FROM \`${refs.usersResearch}\`
    WHERE creator_id IN (${idList(ids)}) AND DATE(started_at) BETWEEN ${d(range.from)} AND ${d(range.to)} ${u} ${id}
    ORDER BY started_at DESC LIMIT 1000`;
}

/**
 * Chargeback Stats — postgres.public_chargebacks (chargeback_at = created_at_transaction) con username del fan
 * e link di provenienza (onlyfans.users_research), filtrabili come in Looker.
 */
export function lkChargebacksSql(refs, ids, range, f = {}) {
  const pt = f.payment ? `AND c.payment_type = '${String(f.payment).replace(/[^a-z_]/g, "")}'` : "";
  const uid = f.user ? `AND c.user_id = ${Math.trunc(Number(f.user)) || 0}` : "";
  const un = f.username ? `AND STARTS_WITH(LOWER(u.username), '${String(f.username).toLowerCase().replace(/[^a-z0-9._-]/g, "")}')` : "";
  return `
    SELECT FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', c.created_at_transaction) AS chargeback_at, c.creator_id, c.user_id, u.username,
      c.payment_type, CAST(c.amount AS FLOAT64) AS amount,
      (SELECT ANY_VALUE(r.link_name) FROM \`${refs.usersResearch}\` r WHERE r.creator_id = c.creator_id AND r.user_id = c.user_id) AS link_name
    FROM \`${refs.chargebacks}\` c LEFT JOIN \`${refs.users}\` u ON u.id = c.user_id
    WHERE c.creator_id IN (${idList(ids)}) AND DATE(c.created_at_transaction) BETWEEN ${d(range.from)} AND ${d(range.to)} ${pt} ${uid} ${un}
    ORDER BY c.created_at_transaction DESC LIMIT 2000`;
}

/**
 * Creator Overall — gli ultimi 7/14/28 giorni FINO A IERI (indipendenti dal periodo scelto), con % Δ sui N
 * giorni prima. Formule ricavate e verificate contro Looker (10/10, tutte le creator, ultimi 7 giorni):
 *   Subs          = SUM(onlyfans.subscriptions.new_subs)               41.090 (Looker 41.099: cache di Looker)
 *   Spend. User   = SUM(onlyfans.transactions_analytics.unique_users)  15.383 ✓ (somma di utenti unici giornalieri)
 *   Revenue       = SUM(onlyfans.attributed_transactions.net)          697.200,09 ✓
 *   Rev. x User   = AVG(transactions_analytics.revenue_per_user)       45,75 ✓ (media delle righe creator×giorno)
 *   Reach         = SUM(onlyfans.reach.total)                          1.784.401 ✓
 * "HOC AVG Rev. x User" = la stessa media su TUTTE le creator (un solo numero aggregato).
 * Le "Links Visits" NON ci sono: hoc.linksinbio_visits legge un foglio Google (hoc.creators_linkinbio,
 * file 1OZCqp_…) che il service account non può aprire (403 "Drive credentials", 10/10).
 */
export function lkOverallSql(refs, ids, today) {
  const list = idList(ids);
  const T = `DATE '${today}'`;
  const win = (n, off) => `day BETWEEN DATE_SUB(${T}, INTERVAL ${n * (off + 1)} DAY) AND DATE_SUB(${T}, INTERVAL ${n * off + 1} DAY)`;
  const block = (n) => ["subs", "users", "rev", "reach"].map((k) => `SUM(IF(${win(n, 0)}, ${k}, 0)) AS ${k}_${n}, SUM(IF(${win(n, 1)}, ${k}, 0)) AS ${k}_${n}_prev`)
    .concat([`AVG(IF(${win(n, 0)}, rpu, NULL)) AS rpu_${n}`, `AVG(IF(${win(n, 1)}, rpu, NULL)) AS rpu_${n}_prev`,
      `AVG(IF(${win(n, 0)}, hoc_rpu, NULL)) AS hoc_rpu_${n}`, `AVG(IF(${win(n, 1)}, hoc_rpu, NULL)) AS hoc_rpu_${n}_prev`]).join(",\n      ");
  const since = `DATE_SUB(${T}, INTERVAL 56 DAY)`;
  const until = `DATE_SUB(${T}, INTERVAL 1 DAY)`;
  return `
    WITH x AS (
      SELECT calendar_date AS day, new_subs AS subs, 0 AS users, 0 AS rev, 0 AS reach, NULL AS rpu, NULL AS hoc_rpu FROM \`${refs.subscriptions}\`
        WHERE creator_id IN (${list}) AND calendar_date BETWEEN ${since} AND ${until}
      UNION ALL
      SELECT calendar_date, 0, unique_users, 0, 0, CAST(revenue_per_user AS FLOAT64), NULL FROM \`${refs.transactionsAnalytics}\`
        WHERE creator_id IN (${list}) AND calendar_date BETWEEN ${since} AND ${until}
      UNION ALL
      SELECT calendar_date, 0, 0, 0, 0, NULL, CAST(revenue_per_user AS FLOAT64) FROM \`${refs.transactionsAnalytics}\`
        WHERE calendar_date BETWEEN ${since} AND ${until}
      UNION ALL
      SELECT calendar_date, 0, 0, CAST(net AS FLOAT64), 0, NULL, NULL FROM \`${refs.attributed}\`
        WHERE creator_id IN (${list}) AND calendar_date BETWEEN ${since} AND ${until}
      UNION ALL
      SELECT calendar_date, 0, 0, 0, total, NULL, NULL FROM \`${refs.reach}\`
        WHERE creator_id IN (${list}) AND calendar_date BETWEEN ${since} AND ${until})
    SELECT
      ${block(7)},
      ${block(14)},
      ${block(28)}
    FROM x`;
}
/** Creator Overall — andamento giornaliero degli ultimi 28 giorni (fino a ieri) per i mini grafici. */
export function lkOverallDailySql(refs, ids, today) {
  const list = idList(ids);
  const T = `DATE '${today}'`;
  const range = `BETWEEN DATE_SUB(${T}, INTERVAL 28 DAY) AND DATE_SUB(${T}, INTERVAL 1 DAY)`;
  return `
    WITH days AS (SELECT day FROM UNNEST(GENERATE_DATE_ARRAY(DATE_SUB(${T}, INTERVAL 28 DAY), DATE_SUB(${T}, INTERVAL 1 DAY))) AS day),
    s AS (SELECT calendar_date AS day, SUM(new_subs) AS subs FROM \`${refs.subscriptions}\` WHERE creator_id IN (${list}) AND calendar_date ${range} GROUP BY 1),
    a AS (SELECT calendar_date AS day, SUM(unique_users) AS users, AVG(CAST(revenue_per_user AS FLOAT64)) AS rpu FROM \`${refs.transactionsAnalytics}\` WHERE creator_id IN (${list}) AND calendar_date ${range} GROUP BY 1),
    t AS (SELECT calendar_date AS day, SUM(net) AS rev FROM \`${refs.attributed}\` WHERE creator_id IN (${list}) AND calendar_date ${range} GROUP BY 1),
    r AS (SELECT calendar_date AS day, SUM(total) AS reach FROM \`${refs.reach}\` WHERE creator_id IN (${list}) AND calendar_date ${range} GROUP BY 1)
    SELECT FORMAT_DATE('%Y-%m-%d', days.day) AS day, IFNULL(s.subs, 0) AS subs, IFNULL(a.users, 0) AS users, IFNULL(t.rev, 0) AS rev, a.rpu, IFNULL(r.reach, 0) AS reach
    FROM days LEFT JOIN s USING (day) LEFT JOIN a USING (day) LEFT JOIN t USING (day) LEFT JOIN r USING (day) ORDER BY day`;
}

/** Dashboard / New Subs Revenue — andamento giornaliero dei nuovi abbonati (hoc.newsubs_spending_daily). */
export function lkNewsubsDailySql(refs, ids, range) {
  return `
    SELECT FORMAT_DATE('%Y-%m-%d', calendar_date) AS day, COUNT(DISTINCT user_key) AS subs, SUM(spend_d0) AS spend_d0, SUM(revenue) AS revenue
    FROM \`${refs.newsubs}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)}
    GROUP BY 1 ORDER BY 1`;
}

/** New Subs Revenue — i nuovi abbonati del periodo, uno per riga, per revenue nei primi 30 giorni. */
export function lkNewsubsListSql(refs, ids, range) {
  return `
    SELECT creator_id, FORMAT_DATE('%Y-%m-%d', calendar_date) AS day, username, sub_type, link_name, placement_username AS placement,
      CAST(revenue AS FLOAT64) AS revenue, CAST(spend_d0 AS FLOAT64) AS spend_d0
    FROM \`${refs.newsubs}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)}
    ORDER BY revenue DESC LIMIT 500`;
}

/** New Subs CR — per creator: abbonati, convertiti, revenue (→ ARPPU, CR) con % Δ sul periodo prima. */
export function lkNewsubsCreatorSql(refs, ids, range) {
  const p = previousRange(range);
  return `
    SELECT creator_id,
      COUNT(DISTINCT IF(cur, user_key, NULL)) AS subs, COUNT(DISTINCT IF(cur, NULL, user_key)) AS subs_prev,
      COUNT(DISTINCT IF(cur AND revenue > 0, user_key, NULL)) AS conv, COUNT(DISTINCT IF(NOT cur AND revenue > 0, user_key, NULL)) AS conv_prev,
      SUM(IF(cur, revenue, 0)) AS revenue, SUM(IF(cur, 0, revenue)) AS revenue_prev
    FROM (SELECT *, calendar_date >= ${d(range.from)} AS cur FROM \`${refs.newsubs}\`
          WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(p.from)} AND ${d(range.to)})
    GROUP BY creator_id`;
}
