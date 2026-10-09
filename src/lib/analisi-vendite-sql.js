// Formule di "Analisi vendite" (fase 1, 9/10/2026): le stesse dei report Looker
// "HOC Analytics 3.0" e "KPI Sales", verificate pagina per pagina sui numeri
// letti in Looker (vedi docs/warehouse-snapshot-2026-10-09/README.md).
// Logica pura (niente Node, niente alias): la usano la lib server, i test e la
// prova di parità. Ogni formula dichiara la pagina Looker da cui viene.
//
// `refs` = nomi completi delle tabelle (fonte primaria o copia di sicurezza,
// li decide lib/analisi-vendite.js). `ids` = creator_id già filtrati per
// split + creator visibili all'utente: qui si validano solo come numeri.

export const VIEWS = ["recap", "conversioni", "rapporto", "meta-mese", "transazioni", "nuovi-abbonati", "tracking", "copertura"];

const DAY = 86400e3;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const parseDay = (s) => Date.parse(`${s}T00:00:00Z`);

export function isDay(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && Number.isFinite(parseDay(s));
}

/** Periodo di default di ogni vista (come in Looker), sempre fino a ieri (UTC). */
export function defaultRange(view, now = new Date()) {
  const y = isoDay(now.getTime() - DAY);
  const days = view === "conversioni" ? 28 : view === "recap" ? 14 : 7;
  if (view === "rapporto" || view === "meta-mese") return { from: `${y.slice(0, 7)}-01`, to: y };
  return { from: isoDay(parseDay(y) - (days - 1) * DAY), to: y };
}

/** Periodo precedente di pari durata (il "% Δ" di Looker). */
export function previousRange({ from, to }) {
  if (!isDay(from) || !isDay(to)) throw new Error("data non valida");
  const len = Math.round((parseDay(to) - parseDay(from)) / DAY) + 1;
  return { from: isoDay(parseDay(from) - len * DAY), to: isoDay(parseDay(from) - DAY) };
}

/** Normalizza e valida il periodo richiesto (max 400 giorni, from ≤ to). */
export function normalizeRange(view, q = {}, now = new Date()) {
  const def = defaultRange(view, now);
  let from = isDay(q.from) ? q.from : def.from;
  let to = isDay(q.to) ? q.to : def.to;
  if (parseDay(from) > parseDay(to)) [from, to] = [to, from];
  if ((parseDay(to) - parseDay(from)) / DAY > 400) from = isoDay(parseDay(to) - 400 * DAY);
  return { from, to };
}

export function idList(ids) {
  const clean = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!clean.length) throw new Error("nessuna creator");
  return clean.join(",");
}

const d = (s) => {
  if (!isDay(s)) throw new Error("data non valida");
  return `DATE '${s}'`;
};

/** Nomi delle pagine (alias "Alessandra Sparagno - IT"), dal registro creator. */
export function namesSql(refs, ids) {
  return `SELECT id AS creator_id, COALESCE(alias, name) AS name FROM \`${refs.creators}\` WHERE id IN (${idList(ids)})`;
}

/**
 * Riepilogo — Looker "HOC Analytics 3.0 › Recap Dashboard".
 * Revenue = SUM(net) di attributed_transactions per calendar_date; nuovi abbonati = SUM(new_subs)
 * di subscriptions; % Δ contro il periodo precedente di pari durata. Verificato al centesimo
 * (25/9-8/10: totale $1.399.080,31, −4,6%).
 */
export function recapSql(refs, ids, range) {
  const p = previousRange(range);
  const list = idList(ids);
  return `
    WITH ids AS (SELECT creator_id FROM UNNEST([${list}]) AS creator_id),
    n AS (SELECT creator_id, SUM(IF(calendar_date >= ${d(range.from)}, net, 0)) AS net, SUM(IF(calendar_date < ${d(range.from)}, net, 0)) AS net_prev
          FROM \`${refs.attributed}\` WHERE creator_id IN (${list}) AND calendar_date BETWEEN ${d(p.from)} AND ${d(range.to)} GROUP BY 1),
    s AS (SELECT creator_id, SUM(IF(calendar_date >= ${d(range.from)}, new_subs, 0)) AS subs, SUM(IF(calendar_date < ${d(range.from)}, new_subs, 0)) AS subs_prev
          FROM \`${refs.subscriptions}\` WHERE creator_id IN (${list}) AND calendar_date BETWEEN ${d(p.from)} AND ${d(range.to)} GROUP BY 1)
    SELECT ids.creator_id, IFNULL(n.net, 0) AS net, IFNULL(n.net_prev, 0) AS net_prev, IFNULL(s.subs, 0) AS subs, IFNULL(s.subs_prev, 0) AS subs_prev
    FROM ids LEFT JOIN n USING (creator_id) LEFT JOIN s USING (creator_id)`;
}

/** Andamento giornaliero del Riepilogo (revenue e nuovi abbonati, somma delle creator scelte). */
export function recapDailySql(refs, ids, range) {
  const list = idList(ids);
  return `
    WITH days AS (SELECT day FROM UNNEST(GENERATE_DATE_ARRAY(${d(range.from)}, ${d(range.to)})) AS day),
    r AS (SELECT calendar_date AS day, SUM(net) AS net FROM \`${refs.attributed}\`
          WHERE creator_id IN (${list}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)} GROUP BY 1),
    s AS (SELECT calendar_date AS day, SUM(new_subs) AS subs FROM \`${refs.subscriptions}\`
          WHERE creator_id IN (${list}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)} GROUP BY 1)
    SELECT FORMAT_DATE('%Y-%m-%d', days.day) AS day, IFNULL(r.net, 0) AS net, IFNULL(s.subs, 0) AS subs
    FROM days LEFT JOIN r USING (day) LEFT JOIN s USING (day) ORDER BY day`;
}

/**
 * Conversioni — Looker "KPI Sales › Conversion Analytics" (+ "Performance KPI per creators").
 * Somme di transactions_analytics: new_subs, new_subs_converted, unique_users ("Converted Users"),
 * num_transactions, tot_revenue; CR = convertiti / nuovi; % Δ di CR e revenue sul periodo
 * precedente. Verificato al centesimo (28 giorni a 8/10: Alessandra 2.087 / 180 / 578 / 1.100 / $37.910,47).
 */
export function conversioniSql(refs, ids, range) {
  const p = previousRange(range);
  return `
    SELECT creator_id,
      SUM(IF(cur, new_subs, 0)) AS new_subs, SUM(IF(cur, new_subs_converted, 0)) AS converted,
      SUM(IF(cur, unique_users, 0)) AS users, SUM(IF(cur, num_transactions, 0)) AS transactions,
      SUM(IF(cur, CAST(tot_revenue AS FLOAT64), 0)) AS revenue,
      SUM(IF(cur, 0, new_subs)) AS new_subs_prev, SUM(IF(cur, 0, new_subs_converted)) AS converted_prev,
      SUM(IF(cur, 0, num_transactions)) AS transactions_prev, SUM(IF(cur, 0, CAST(tot_revenue AS FLOAT64))) AS revenue_prev
    FROM (
      SELECT *, calendar_date >= ${d(range.from)} AS cur FROM \`${refs.transactionsAnalytics}\`
      WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(p.from)} AND ${d(range.to)}
    ) GROUP BY creator_id`;
}

/**
 * Rapporto vendite — Looker "KPI Sales › Sales Ratio" = vista hoc.sales_kpi.
 * Per creator e MESE (il filtro date di Looker agisce sul mese): tutte le transazioni con
 * netto > 0, abbonamenti compresi; media = revenue / transazioni; MED = mediana vera
 * (PERCENTILE_CONT); RR = media / mediana (quanto le vendite grandi tirano su la media).
 * Verificato: ott 2026 Alessandra MED 24,8, RR 1,49.
 */
export function rapportoSql(refs, ids, range) {
  return `
    WITH base AS (
      SELECT creator_id, DATE_TRUNC(calendar_date, MONTH) AS month, CAST(net AS FLOAT64) AS net
      FROM \`${refs.attributed}\`
      WHERE creator_id IN (${idList(ids)}) AND net > 0
        AND calendar_date BETWEEN DATE_TRUNC(${d(range.from)}, MONTH) AND LAST_DAY(${d(range.to)})
    ),
    med AS (SELECT DISTINCT creator_id, month, PERCENTILE_CONT(net, 0.5) OVER (PARTITION BY creator_id, month) AS median FROM base)
    SELECT b.creator_id, FORMAT_DATE('%Y-%m', b.month) AS month, COUNT(*) AS transactions, SUM(b.net) AS revenue,
           SUM(b.net) / COUNT(*) AS avg, ANY_VALUE(m.median) AS median, SAFE_DIVIDE(SUM(b.net) / COUNT(*), ANY_VALUE(m.median)) AS rr
    FROM base b JOIN med m USING (creator_id, month)
    GROUP BY b.creator_id, b.month`;
}

/**
 * KPI per metà mese — Looker "HOC Analytics 3.0 › Detailed Performance KPI per creators" = tabella
 * onlyfans.kpi (1ª metà = giorni 1-15, 2ª = dal 16). Verificato: ott 2026 Alessandra
 * $9.917,78 / 267 transazioni / 124 spender / 621 abbonati nella 1ª metà.
 */
export function metaMeseSql(refs, ids, range) {
  return `
    SELECT creator_id, FORMAT_DATE('%Y-%m', month) AS month,
      CAST(mid_month_revenue AS FLOAT64) AS mid_revenue, mid_month_num_transactions AS mid_transactions,
      mid_month_unique_users AS mid_users, mid_new_subs AS mid_subs,
      CAST(end_month_revenue AS FLOAT64) AS end_revenue, end_month_num_transactions AS end_transactions,
      end_month_unique_users AS end_users, end_new_subs AS end_subs,
      CAST(total_month_revenue AS FLOAT64) AS total_revenue
    FROM \`${refs.kpi}\`
    WHERE creator_id IN (${idList(ids)}) AND month BETWEEN DATE_TRUNC(${d(range.from)}, MONTH) AND DATE_TRUNC(${d(range.to)}, MONTH)`;
}

/**
 * Transazioni — Looker "HOC Analytics 3.0 › Transactions Details": righe di attributed_transactions
 * (più recenti prima), con link di provenienza e data di abbonamento del fan. Tetto di righe.
 */
export function transazioniSql(refs, ids, range, limit = 500) {
  return `
    SELECT FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at, creator_id, user_id,
      FORMAT_DATE('%Y-%m-%d', started_calendar_date) AS subscribed_on, link_name, spending_id, type,
      CAST(net AS FLOAT64) AS net, CAST(amount AS FLOAT64) AS amount
    FROM \`${refs.attributed}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)}
    ORDER BY created_at DESC LIMIT ${Math.min(2000, Math.max(1, Number(limit) || 500))}`;
}

/**
 * Chargeback — Looker "HOC Analytics 3.0 › Chargeback Stats": "chargeback_at" = created_at_transaction
 * (verificato: 8/10 22:47:40, $100). Username del fan dal registro utenti.
 */
export function chargebackSql(refs, ids, range) {
  return `
    SELECT FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', c.created_at_transaction) AS chargeback_at, c.creator_id, c.user_id,
      u.username, c.payment_type, CAST(c.amount AS FLOAT64) AS amount
    FROM \`${refs.chargebacks}\` c LEFT JOIN \`${refs.users}\` u ON u.id = c.user_id
    WHERE c.creator_id IN (${idList(ids)}) AND DATE(c.created_at_transaction) BETWEEN ${d(range.from)} AND ${d(range.to)}
    ORDER BY c.created_at_transaction DESC LIMIT 500`;
}

/**
 * Nuovi abbonati — Looker "HOC Analytics 3.0 › Dashboard" (+ "New Subs CR"), tabella hoc.newsubs_spending_daily.
 * Unità = coppia fan×creator (`user_key`): un fan su due creator conta due volte.
 * LTV 1° giorno = SUM(spend_d0) / abbonati; CR 1° giorno = abbonati con spend_d0 > 0 / abbonati;
 * LTV 30 gg = SUM(revenue) / abbonati; CR 30 gg = abbonati con revenue > 0 / abbonati; ARPPU = revenue / convertiti.
 * Verificato (2-8/10, tutta l'agenzia): 21.346 · $4,84 · 9% · $5,90 · 10,25% · $57,58; Fishball EN 91 · $11,87 · 5,49% · $215,94.
 * `dim` = colonna di raggruppamento (sub_type | creator_id), già validata.
 */
export function nuoviMetricsSql(refs, ids, range, dim) {
  if (!["sub_type", "creator_id"].includes(dim)) throw new Error("raggruppamento non valido");
  return `
    SELECT ${dim} AS k, COUNT(DISTINCT user_key) AS subs, SUM(spend_d0) AS spend_d0,
      COUNT(DISTINCT IF(spend_d0 > 0, user_key, NULL)) AS conv_d0, SUM(revenue) AS revenue,
      COUNT(DISTINCT IF(revenue > 0, user_key, NULL)) AS conv
    FROM \`${refs.newsubs}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)}
    GROUP BY ROLLUP(${dim})`;
}

/**
 * Nuovi abbonati in PERSONE — Looker "New Subs Revenue": unità = fan (`user_id`), una persona su più creator conta una volta.
 * "Nuovi" = tutto ciò che non è returning (trial compresi). Periodo e periodo precedente.
 * Verificato (2-8/10): 17.881 persone (2.177 di ritorno, 15.975 nuove), $126.047,83, convertiti 2.025 (203 / 1.833).
 */
export function nuoviPersoneSql(refs, ids, range) {
  const p = previousRange(range);
  return `
    SELECT cur,
      COUNT(DISTINCT user_id) AS gained,
      COUNT(DISTINCT IF(sub_type = 'returning_subscriber', user_id, NULL)) AS gained_ret,
      COUNT(DISTINCT IF(sub_type != 'returning_subscriber', user_id, NULL)) AS gained_new,
      SUM(revenue) AS revenue,
      SUM(IF(sub_type = 'returning_subscriber', revenue, 0)) AS revenue_ret,
      SUM(IF(sub_type != 'returning_subscriber', revenue, 0)) AS revenue_new,
      COUNT(DISTINCT IF(revenue > 0, user_id, NULL)) AS conv,
      COUNT(DISTINCT IF(revenue > 0 AND sub_type = 'returning_subscriber', user_id, NULL)) AS conv_ret,
      COUNT(DISTINCT IF(revenue > 0 AND sub_type != 'returning_subscriber', user_id, NULL)) AS conv_new
    FROM (SELECT *, calendar_date >= ${d(range.from)} AS cur FROM \`${refs.newsubs}\`
          WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(p.from)} AND ${d(range.to)})
    GROUP BY cur`;
}

/**
 * Nuovi abbonati per link — Looker "New Subs CR": per creator, link, placement e alterego.
 * Verificato (2-8/10): Giulia Ottorini, senza link → $6.473,49 · 903 · 97 · 10,74% · ARPPU $66,74.
 */
export function nuoviLinkSql(refs, ids, range) {
  return `
    SELECT creator_id, link_name, placement_username AS placement, alterego,
      SUM(revenue) AS revenue, COUNT(DISTINCT user_key) AS subs, COUNT(DISTINCT IF(revenue > 0, user_key, NULL)) AS conv
    FROM \`${refs.newsubs}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)}
    GROUP BY 1, 2, 3, 4
    ORDER BY revenue DESC LIMIT 1000`;
}

/**
 * Tracking link — Looker "Tracking Links Stats" + "Clicks Overall", tabella onlyfans.links_stats.
 * Click e abbonati = somme dei `*_diff` giornalieri; revenue = spesa nel periodo di TUTTI i fan entrati da quel link
 * (anche prima del periodo); new_sub_revenue = solo dei nuovi. Traffico organico escluso (non passa da un link).
 * Verificato (2-8/10): Alessandra c3 898 · 115 · $2.596,37 · $381,59; Fishball IT 9.331 click · 515 abbonati.
 */
export function trackingSql(refs, ids, range) {
  const p = previousRange(range);
  return `
    SELECT creator_id, link_name, link_url, ANY_VALUE(placement) AS placement, ANY_VALUE(spending_id) AS spending_id,
      SUM(IF(cur, clicks_diff, 0)) AS clicks, SUM(IF(cur, 0, clicks_diff)) AS clicks_prev,
      SUM(IF(cur, subs_diff, 0)) AS subs, SUM(IF(cur, 0, subs_diff)) AS subs_prev,
      SUM(IF(cur, revenue, 0)) AS revenue, SUM(IF(cur, 0, revenue)) AS revenue_prev,
      SUM(IF(cur, new_sub_revenue, 0)) AS new_sub_revenue
    FROM (SELECT *, calendar_date >= ${d(range.from)} AS cur FROM \`${refs.linksStats}\`
          WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(p.from)} AND ${d(range.to)})
    GROUP BY creator_id, link_name, link_url
    HAVING clicks != 0 OR subs != 0 OR revenue != 0 OR clicks_prev != 0 OR subs_prev != 0`;
}

/**
 * Copertura — Looker "Creators Reach" / "Creator Overall", tabella onlyfans.reach (SUM(total) dei giorni).
 * Verificato (2-8/10): Giulia Ottorini 77.350 (+15,9%), Fishball IT 60.430 (+145,6%), Cubanita 60.776 (−39,6%).
 */
export function coperturaSql(refs, ids, range) {
  const p = previousRange(range);
  return `
    SELECT creator_id, SUM(IF(calendar_date >= ${d(range.from)}, total, 0)) AS reach, SUM(IF(calendar_date < ${d(range.from)}, total, 0)) AS reach_prev
    FROM \`${refs.reach}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(p.from)} AND ${d(range.to)}
    GROUP BY creator_id`;
}

export function coperturaDailySql(refs, ids, range) {
  return `
    SELECT FORMAT_DATE('%Y-%m-%d', calendar_date) AS day, SUM(total) AS reach
    FROM \`${refs.reach}\`
    WHERE creator_id IN (${idList(ids)}) AND calendar_date BETWEEN ${d(range.from)} AND ${d(range.to)}
    GROUP BY 1 ORDER BY 1`;
}

/** Variazione percentuale come in Looker: null se il periodo prima è zero. */
export function pctDelta(cur, prev) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  if (!p) return null;
  return (c - p) / Math.abs(p);
}
