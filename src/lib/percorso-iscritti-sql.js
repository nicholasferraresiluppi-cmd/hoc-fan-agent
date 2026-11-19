/**
 * SQL del percorso dei nuovi iscritti (14/11/2026) e forma del risultato — puro, senza dipendenze dell'app:
 * testabile con node e lanciabile a mano. Razionale in percorso-iscritti.js.
 *
 * Fan per fan, per ogni pagina: quando si iscrive per la prima volta, il primo giro
 * di acquisti (quanto dopo, quanti $), la pausa, il secondo giro, il terzo. Poi tutto
 * aggregato in SQL (niente fan nominati in uscita): per pagina × mese di iscrizione,
 * con le righe «tutte le pagine» e «tutti i mesi» (GROUPING SETS).
 */
export const HOC_ORG = "5598597c-7fab-4fe1-acb3-5358df7d9dc5"; // = HOC_ORGANIZATION_ID di bigquery-api
export const GIRO_GAP_HOURS = 6;   // acquisti a meno di 6 ore l'uno dall'altro = un solo giro (misurato: il grosso dei riacquisti cade entro 2 ore)
export const STAGE_DAYS = 30;      // ogni passo si guarda per 30 giorni: 1ª spesa entro 30 gg dall'iscrizione, ritorno entro 30 gg dal giro prima
export const MONTHS = 6;           // mesi di iscrizione mostrati (il corrente compreso)
export const SPEND_TYPES = ["message", "tip", "post"]; // l'abbonamento (e il rinnovo) è l'ingresso, non una spesa

// Fasce: limiti superiori esclusivi; l'ultima fascia è «oltre».
export const FIRST_HOURS_EDGES = [1, 6, 24, 72, 168];          // <1h · 1-6h · 6-24h · 1-3g · 3-7g · 7-30g
export const AMOUNT_EDGES = [10, 25, 50, 100, 250];             // <10 · 10-25 · 25-50 · 50-100 · 100-250 · 250+
export const PAUSE_HOURS_EDGES = [24, 72, 168, 336];            // 6-24h · 1-3g · 3-7g · 7-14g · 14-30g

const ids = (list) => list.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);

/** COUNTIF per fascia: b0..bN (l'ultima = oltre l'ultimo limite). Solo dove x non è NULL. */
function buckets(expr, edges, prefix) {
  const out = [];
  edges.forEach((e, i) => {
    const lo = i === 0 ? null : edges[i - 1];
    out.push(`COUNTIF(${expr} IS NOT NULL${lo == null ? "" : ` AND ${expr} >= ${lo}`} AND ${expr} < ${e}) ${prefix}${i}`);
  });
  out.push(`COUNTIF(${expr} >= ${edges[edges.length - 1]}) ${prefix}${edges.length}`);
  return out.join(",\n  ");
}

/** Quartili [p25, p50, p75] di una colonna (NULL ignorati). */
const q = (expr, name) => `APPROX_QUANTILES(${expr}, 4)[SAFE_OFFSET(1)] ${name}_p25, APPROX_QUANTILES(${expr}, 4)[SAFE_OFFSET(2)] ${name}_p50, APPROX_QUANTILES(${expr}, 4)[SAFE_OFFSET(3)] ${name}_p75`;

/**
 * Una query, quattro tipi di riga (colonna `kind`):
 *   main — il percorso: conteggi, quartili e fasce (per pagina × mese, con «all»);
 *   hour — iscritti e paganti per ora d'iscrizione (ora italiana);
 *   dow  — iscritti e paganti per giorno della settimana (1 = domenica);
 *   link — da quale link arrivano (prime 8 per pagina × mese, e per pagina su tutti i mesi).
 * `t` = { subs, attributed } tabelle complete.
 */
export function journeySql(t, creatorIds, org = HOC_ORG) {
  const list = ids(creatorIds).join(",");
  if (!list) throw new Error("Nessuna pagina");
  const tz = "Europe/Rome";
  const S = STAGE_DAYS;
  return `
WITH first_sub AS (
  SELECT creator_id, user_id, MIN(started_at) sub_at,
    ARRAY_AGG(link_name IGNORE NULLS ORDER BY started_at LIMIT 1)[SAFE_OFFSET(0)] link
  FROM \`${t.subs}\`
  WHERE creator_id IN (${list}) AND organization_id = '${org}' AND user_id IS NOT NULL
  GROUP BY 1, 2
),
cohort AS (
  SELECT * FROM first_sub
  WHERE sub_at >= TIMESTAMP(DATE_TRUNC(DATE_SUB(CURRENT_DATE('${tz}'), INTERVAL ${MONTHS - 1} MONTH), MONTH), '${tz}')
),
tx AS (
  SELECT creator_id, user_id, id, ANY_VALUE(created_at) ts, ANY_VALUE(CAST(net AS FLOAT64)) net
  FROM \`${t.attributed}\`
  WHERE creator_id IN (${list}) AND organization_id = '${org}' AND user_id IS NOT NULL
    AND type IN (${SPEND_TYPES.map((x) => `'${x}'`).join(", ")})
    AND calendar_date >= DATE_SUB(DATE_TRUNC(DATE_SUB(CURRENT_DATE('${tz}'), INTERVAL ${MONTHS - 1} MONTH), MONTH), INTERVAL 1 DAY)
  GROUP BY 1, 2, 3
),
seq AS (
  SELECT c.creator_id, c.user_id, x.ts, x.net,
    IF(TIMESTAMP_DIFF(x.ts, LAG(x.ts) OVER w, MINUTE) < ${GIRO_GAP_HOURS * 60}, 0, 1) is_new
  FROM cohort c JOIN tx x USING (creator_id, user_id)
  WHERE x.ts >= c.sub_at AND x.ts < TIMESTAMP_ADD(c.sub_at, INTERVAL ${S * 4} DAY)
  WINDOW w AS (PARTITION BY c.creator_id, c.user_id ORDER BY x.ts)
),
giri AS (
  SELECT creator_id, user_id, giro, MIN(ts) g_start, MAX(ts) g_end, SUM(net) amt
  FROM (SELECT *, SUM(is_new) OVER (PARTITION BY creator_id, user_id ORDER BY ts) giro FROM seq)
  WHERE giro <= 3
  GROUP BY 1, 2, 3
),
raw AS (
  SELECT c.creator_id, c.user_id, c.sub_at, c.link,
    FORMAT_TIMESTAMP('%Y-%m', c.sub_at, '${tz}') sub_month,
    EXTRACT(HOUR FROM c.sub_at AT TIME ZONE '${tz}') hr,
    EXTRACT(DAYOFWEEK FROM c.sub_at AT TIME ZONE '${tz}') dow,
    MAX(IF(g.giro = 1, g.g_start, NULL)) g1s, MAX(IF(g.giro = 1, g.g_end, NULL)) g1e, MAX(IF(g.giro = 1, g.amt, NULL)) g1a,
    MAX(IF(g.giro = 2, g.g_start, NULL)) g2s, MAX(IF(g.giro = 2, g.g_end, NULL)) g2e, MAX(IF(g.giro = 2, g.amt, NULL)) g2a,
    MAX(IF(g.giro = 3, g.g_start, NULL)) g3s, MAX(IF(g.giro = 3, g.amt, NULL)) g3a
  FROM cohort c LEFT JOIN giri g USING (creator_id, user_id)
  GROUP BY 1, 2, 3, 4, 5, 6, 7
),
-- Ogni passo vale solo dentro la sua finestra di ${S} giorni, e si conta solo chi è stato osservato abbastanza («maturo»).
f1 AS (
  SELECT *,
    TIMESTAMP_ADD(sub_at, INTERVAL ${S} DAY) <= CURRENT_TIMESTAMP() ripe1,
    g1s IS NOT NULL AND g1s < TIMESTAMP_ADD(sub_at, INTERVAL ${S} DAY) spent
  FROM raw
),
f2 AS (
  SELECT *,
    ripe1 AND spent AND TIMESTAMP_ADD(g1e, INTERVAL ${S} DAY) <= CURRENT_TIMESTAMP() ripe2,
    spent AND g2s IS NOT NULL AND g2s < TIMESTAMP_ADD(g1e, INTERVAL ${S} DAY) back2
  FROM f1
),
f3 AS (
  SELECT *,
    ripe2 AND back2 AND TIMESTAMP_ADD(g2e, INTERVAL ${S} DAY) <= CURRENT_TIMESTAMP() ripe3,
    back2 AND g3s IS NOT NULL AND g3s < TIMESTAMP_ADD(g2e, INTERVAL ${S} DAY) back3
  FROM f2
),
-- Tempi e importi solo sui fan maturi per quel passo: nei mesi recenti, senza questo filtro,
-- resterebbero solo i fan più rapidi e i tempi uscirebbero più corti del vero.
fan AS (
  SELECT *,
    IF(ripe1 AND spent, TIMESTAMP_DIFF(g1s, sub_at, MINUTE) / 60, NULL) h_first,
    IF(ripe1 AND spent, g1a, NULL) a1,
    IF(ripe2 AND back2, TIMESTAMP_DIFF(g2s, g1e, MINUTE) / 60, NULL) h_pause1,
    IF(ripe2 AND back2, g2a, NULL) a2,
    IF(ripe3 AND back3, TIMESTAMP_DIFF(g3s, g2e, MINUTE) / 60, NULL) h_pause2,
    IF(ripe3 AND back3, g3a, NULL) a3
  FROM f3
),
-- Spesa dei primi ${S} giorni dall'iscrizione (tutti i giri), per il valore per iscritto.
v30 AS (
  SELECT c.creator_id, c.user_id, SUM(x.net) net30
  FROM cohort c JOIN tx x USING (creator_id, user_id)
  WHERE x.ts >= c.sub_at AND x.ts < TIMESTAMP_ADD(c.sub_at, INTERVAL ${S} DAY)
  GROUP BY 1, 2
),
fanv AS (SELECT fan.*, IFNULL(v30.net30, 0) net30 FROM fan LEFT JOIN v30 USING (creator_id, user_id)),
main AS (
  SELECT 'main' kind, IFNULL(CAST(creator_id AS STRING), 'all') page, IFNULL(sub_month, 'all') month, CAST(NULL AS STRING) k,
    COUNT(*) subs, MIN(sub_at) first_sub, MAX(sub_at) last_sub,
    COUNTIF(ripe1) ripe1, COUNTIF(ripe1 AND spent) spent, ROUND(SUM(IF(ripe1, net30, 0)), 2) net30,
    COUNTIF(ripe2) ripe2, COUNTIF(ripe2 AND back2) back2,
    COUNTIF(ripe3) ripe3, COUNTIF(ripe3 AND back3) back3,
    ${q("h_first", "h_first")}, ${q("a1", "a1")}, ROUND(AVG(a1), 2) a1_avg,
    ${q("h_pause1", "h_pause1")}, ${q("a2", "a2")}, ROUND(AVG(a2), 2) a2_avg,
    ${q("h_pause2", "h_pause2")}, ${q("a3", "a3")},
    ${buckets("h_first", FIRST_HOURS_EDGES, "hf")},
    ${buckets("a1", AMOUNT_EDGES, "a1b")},
    ${buckets("h_pause1", PAUSE_HOURS_EDGES, "hp")},
    ${buckets("a2", AMOUNT_EDGES, "a2b")}
  FROM fanv
  GROUP BY GROUPING SETS ((creator_id, sub_month), (sub_month), (creator_id), ())
),
by_hour AS (
  SELECT 'hour' kind, IFNULL(CAST(creator_id AS STRING), 'all') page, IFNULL(sub_month, 'all') month, CAST(hr AS STRING) k,
    COUNT(*) subs, COUNTIF(ripe1) ripe1, COUNTIF(ripe1 AND spent) spent, ROUND(SUM(IF(ripe1, net30, 0)), 2) net30
  FROM fanv GROUP BY GROUPING SETS ((creator_id, sub_month, hr), (sub_month, hr), (creator_id, hr), (hr))
),
by_dow AS (
  SELECT 'dow' kind, IFNULL(CAST(creator_id AS STRING), 'all') page, IFNULL(sub_month, 'all') month, CAST(dow AS STRING) k,
    COUNT(*) subs, COUNTIF(ripe1) ripe1, COUNTIF(ripe1 AND spent) spent, ROUND(SUM(IF(ripe1, net30, 0)), 2) net30
  FROM fanv GROUP BY GROUPING SETS ((creator_id, sub_month, dow), (sub_month, dow), (creator_id, dow), (dow))
),
by_link AS (
  SELECT 'link' kind, CAST(creator_id AS STRING) page, IFNULL(sub_month, 'all') month, IFNULL(link, '(senza link)') k,
    COUNT(*) subs, COUNTIF(ripe1) ripe1, COUNTIF(ripe1 AND spent) spent, ROUND(SUM(IF(ripe1, net30, 0)), 2) net30
  FROM fanv GROUP BY GROUPING SETS ((creator_id, sub_month, link), (creator_id, link))
)
SELECT TO_JSON_STRING(m) j FROM main m
UNION ALL SELECT TO_JSON_STRING(h) FROM by_hour h
UNION ALL SELECT TO_JSON_STRING(d) FROM by_dow d
UNION ALL SELECT TO_JSON_STRING(l) FROM (
  SELECT * FROM by_link QUALIFY ROW_NUMBER() OVER (PARTITION BY page, month ORDER BY subs DESC) <= 8
) l`;
}

/** Le righe della query (una colonna JSON per riga) → struttura per pagina e mese. Pura: testabile. */
export function shapeJourney(rows, pages) {
  const main = {}, hour = {}, dow = {}, link = {};
  const put = (o, page, month) => ((o[page] ||= {})[month] ||= []);
  for (const raw of rows) {
    const r = typeof raw.j === "string" ? JSON.parse(raw.j) : raw;
    const { kind, page, month } = r;
    if (kind === "main") (main[page] ||= {})[month] = r;
    else if (kind === "hour") put(hour, page, month)[Number(r.k)] = { subs: r.subs, ripe1: r.ripe1, spent: r.spent, net30: r.net30 };
    else if (kind === "dow") put(dow, page, month)[Number(r.k) - 1] = { subs: r.subs, ripe1: r.ripe1, spent: r.spent, net30: r.net30 };
    else if (kind === "link") put(link, page, month).push({ link: r.k, subs: r.subs, ripe1: r.ripe1, spent: r.spent, net30: r.net30 });
  }
  const fill = (arr, n) => Array.from({ length: n }, (_, i) => arr?.[i] || { subs: 0, ripe1: 0, spent: 0, net30: 0 });
  for (const o of [hour]) for (const p of Object.keys(o)) for (const m of Object.keys(o[p])) o[p][m] = fill(o[p][m], 24);
  for (const o of [dow]) for (const p of Object.keys(o)) for (const m of Object.keys(o[p])) o[p][m] = fill(o[p][m], 7);
  for (const p of Object.keys(link)) for (const m of Object.keys(link[p])) link[p][m].sort((a, b) => b.subs - a.subs);
  const months = Object.keys(main.all || {}).filter((m) => m !== "all").sort();
  const known = new Set(Object.keys(main));
  return {
    pages: pages.filter((p) => known.has(String(p.creator_id))).map((p) => ({ ...p, creator_id: String(p.creator_id) })),
    months, main, hour, dow, link,
  };
}
