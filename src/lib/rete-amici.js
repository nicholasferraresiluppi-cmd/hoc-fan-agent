/**
 * Rete amici (20/10/2026) — quanti iscritti porta la sezione «Amici» del profilo OnlyFans.
 *
 * Nicholas, davanti ai profili gratuiti su Infloww: «vorrei tracciare quanti utenti arrivano da
 * questi amici». OnlyFans non lo dice: la scheda Amici porta al profilo, non a un tracking link.
 * Il warehouse però ha lo storico iscrizioni fan per fan (hoc.subscriptions_history_intervals, con
 * trial/funnel di provenienza): un nuovo iscritto senza link che in quel momento era iscritto a una
 * pagina che mostra questa tra gli Amici, quasi certamente è passato da lì. Prova del 20/10 su
 * Anastasia: 1.100 dei 2.311 nuovi iscritti in due mesi (48%).
 *
 * Chi mostra chi NON è nei dati: lo segna a mano chi gestisce i profili (KV `amici:links`), con la
 * data in cui l'amico è stato aggiunto. Un collegamento non si cancella mai: si chiude con la data in
 * cui è stato tolto — la storia serve al prima/dopo, che è l'unico modo per separare la scheda Amici
 * dalle altre spinte della stessa pagina (post, massivi, S4S senza link).
 *
 * Solo numeri aggregati (nessun fan nominato). Spesa letta solo sull'organizzazione HOC.
 * Costo misurato: ~1 GB per 2 pagine promosse; cache KV giornaliera legata all'elenco dei collegamenti.
 */
import crypto from "crypto";
import { kv } from "@vercel/kv";
import { bqQuery, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { pagesFor } from "@/lib/live-creators-store";
import { personOfPage, countryOfPage } from "@/lib/live-creators";
import { normalizeLink, pairsToMeasure, shapeResults, WEEKS } from "@/lib/rete-amici-core";

export const AMICI_VERSION = "amici-1";
const LINKS_KEY = "amici:links";
const MAX_BYTES = 12 * 1024 ** 3;
const P = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const today = () => new Date().toISOString().slice(0, 10);

// ── Collegamenti ────────────────────────────────────────────────────────────

export async function listLinks() {
  const v = await kv.get(LINKS_KEY).catch(() => null);
  return Array.isArray(v) ? v : [];
}

export async function addLink(input, userId) {
  const l = normalizeLink(input, today());
  const links = await listLinks();
  if (links.some((x) => !x.until && x.host_id === l.host_id && x.target_id === l.target_id)) throw new Error("Questo collegamento c'è già");
  const rec = { id: crypto.randomUUID().slice(0, 8), ...l, until: null, by: userId || null, at: new Date().toISOString() };
  await kv.set(LINKS_KEY, [...links, rec]);
  return rec;
}

/** Chiude un collegamento (l'amico è stato tolto dal profilo). Mai cancellato: serve al prima/dopo. */
export async function closeLink(id, until, userId) {
  const day = until || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today()) throw new Error("Data non valida");
  const links = await listLinks();
  const l = links.find((x) => x.id === id);
  if (!l) throw new Error("Collegamento non trovato");
  if (l.until) throw new Error("Già chiuso");
  if (l.since && day < l.since) throw new Error("La data di chiusura è prima di quella di aggiunta");
  l.until = day;
  l.closed_by = userId || null;
  await kv.set(LINKS_KEY, links);
  return l;
}

/** Correzione della data di aggiunta (es. "c'era già" → data vera ritrovata). */
export async function setSince(id, since, userId) {
  const links = await listLinks();
  const l = links.find((x) => x.id === id);
  if (!l) throw new Error("Collegamento non trovato");
  const n = normalizeLink({ ...l, since }, today());
  if (l.until && n.since && n.since > l.until) throw new Error("La data di aggiunta è dopo quella di chiusura");
  l.since = n.since;
  l.edited_by = userId || null;
  await kv.set(LINKS_KEY, links);
  return l;
}

// ── Misura ──────────────────────────────────────────────────────────────────

const ids = (a) => a.map(Number).filter((n) => Number.isInteger(n) && n > 0).join(", ");

/**
 * Una riga per (pagina promossa, settimana, tipo) + (…, 'host', pagina che la mostra).
 * "Nuovo iscritto" = prima iscrizione di sempre alla pagina, nelle ultime WEEKS settimane.
 * "Altre pagine HOC" = solo pagine con dati dell'organizzazione HOC negli ultimi 60 giorni (il warehouse è multi-agenzia).
 * Spesa = netto speso sulla pagina promossa nei 30 giorni dall'iscrizione, solo per chi si è iscritto da almeno 30 giorni ("maturi").
 */
export function measureSql(pairs) {
  const p = P();
  const structs = pairs.map((x, i) => (i === 0 ? `STRUCT(${Number(x.host)} AS host, ${Number(x.target)} AS target)` : `(${Number(x.host)}, ${Number(x.target)})`)).join(", ");
  const targets = ids([...new Set(pairs.map((x) => x.target))]);
  return `
WITH links AS (SELECT * FROM UNNEST([${structs}])),
s AS (
  SELECT creator_id, user_id, trial_id, funnel_id, start_time, end_time
  FROM \`${p}.hoc.subscriptions_history_intervals\`
),
hoc_pages AS (
  SELECT DISTINCT creator_id FROM \`${p}.onlyfans.reach\`
  WHERE organization_id = '${HOC_ORGANIZATION_ID}' AND calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
),
firsts AS (
  SELECT creator_id AS target, user_id,
    ARRAY_AGG(STRUCT(start_time AS t, trial_id, funnel_id) ORDER BY start_time LIMIT 1)[OFFSET(0)] AS f
  FROM s WHERE creator_id IN (${targets})
  GROUP BY 1, 2
),
newsubs AS (
  SELECT target, user_id, f.t AS t, (f.trial_id IS NOT NULL OR f.funnel_id IS NOT NULL) AS via_link
  FROM firsts WHERE f.t >= TIMESTAMP(DATE_SUB(DATE_TRUNC(CURRENT_DATE(), ISOWEEK), INTERVAL ${(WEEKS - 1) * 7} DAY))
),
active_at AS (
  SELECT n.target, n.user_id, o.creator_id AS other, LOGICAL_OR(l.host IS NOT NULL) AS is_host
  FROM newsubs n
  JOIN s o ON o.user_id = n.user_id AND o.creator_id != n.target
    AND o.start_time < n.t AND (o.end_time IS NULL OR o.end_time > n.t)
  LEFT JOIN links l ON l.target = n.target AND l.host = o.creator_id
  WHERE o.creator_id IN (SELECT creator_id FROM hoc_pages) OR l.host IS NOT NULL
  GROUP BY 1, 2, 3
),
flags AS (
  SELECT target, user_id, LOGICAL_OR(is_host) AS any_host, LOGICAL_OR(NOT is_host) AS any_other
  FROM active_at GROUP BY 1, 2
),
spend AS (
  SELECT n.target, n.user_id, SUM(a.net) AS net30
  FROM newsubs n
  JOIN \`${p}.onlyfans.attributed_transactions\` a
    ON a.creator_id = n.target AND a.user_id = n.user_id
   AND a.calendar_date BETWEEN DATE(n.t) AND DATE_ADD(DATE(n.t), INTERVAL 30 DAY)
  WHERE a.organization_id = '${HOC_ORGANIZATION_ID}'
    AND a.creator_id IN (${targets})
    AND a.calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${WEEKS * 7 + 7} DAY)
  GROUP BY 1, 2
),
fan AS (
  SELECT n.target, n.user_id, DATE_TRUNC(DATE(n.t), ISOWEEK) AS week,
    DATE(n.t) <= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AS ripe,
    CASE WHEN n.via_link THEN 'link' WHEN f.any_host THEN 'friends' WHEN f.any_other THEN 'other_hoc' ELSE 'direct' END AS kind,
    COALESCE(sp.net30, 0) AS net30
  FROM newsubs n LEFT JOIN flags f USING (target, user_id) LEFT JOIN spend sp USING (target, user_id)
)
SELECT target, CAST(week AS STRING) AS week, kind, CAST(NULL AS INT64) AS host, COUNT(*) AS fans,
  COUNTIF(ripe) AS ripe_fans, ROUND(SUM(IF(ripe, net30, 0)), 2) AS ripe_net30, COUNTIF(ripe AND net30 > 0) AS ripe_payers
FROM fan GROUP BY 1, 2, 3
UNION ALL
SELECT fan.target, CAST(fan.week AS STRING), 'host', a.other, COUNT(*),
  COUNTIF(fan.ripe), ROUND(SUM(IF(fan.ripe, fan.net30, 0)), 2), COUNTIF(fan.ripe AND fan.net30 > 0)
FROM fan JOIN active_at a ON a.target = fan.target AND a.user_id = fan.user_id AND a.is_host
WHERE fan.kind = 'friends'
GROUP BY 1, 2, 3, 4`;
}

/** Nome leggibile di una pagina: persona + paese (le pagine dello stesso nome si distinguono). */
async function pageNames(list) {
  if (!list.length) return {};
  const pages = await pagesFor(list).catch(() => []);
  return Object.fromEntries(pages.map((p) => {
    const c = countryOfPage(p);
    return [Number(p.id), `${personOfPage(p)}${c && c !== "IT" ? ` ${c === "EN" ? "ENG" : c}` : ""}${p.username ? ` · @${p.username}` : ""}`];
  }));
}

export async function computeRete(links) {
  const day = today();
  const pairs = pairsToMeasure(links, day);
  const all = [...new Set(links.flatMap((l) => [Number(l.host_id), Number(l.target_id)]))];
  const names = await pageNames(all);
  if (!pairs.length) return { version: AMICI_VERSION, computed_at: Date.now(), today: day, names, targets: [] };
  const { rows } = await bqQuery(measureSql(pairs), { maxBytesBilled: MAX_BYTES, timeoutMs: 55_000 });
  return { version: AMICI_VERSION, computed_at: Date.now(), today: day, names, targets: shapeResults(rows, links, names, day) };
}

const cacheKey = (links) => {
  const h = crypto.createHash("sha1").update(JSON.stringify(links.map((l) => [l.host_id, l.target_id, l.since, l.until]))).digest("hex").slice(0, 12);
  return `amici:rete:${AMICI_VERSION}:${today()}:${h}`;
};

/** Cache del giorno, legata ai collegamenti: aggiungerne uno rifà il conto subito. */
export async function getRete({ force = false } = {}) {
  const links = await listLinks();
  const key = cacheKey(links);
  if (!force) {
    const hit = await kv.get(key).catch(() => null);
    if (hit) return { ...hit, links, cached: true };
  }
  const fresh = await computeRete(links);
  await kv.set(key, fresh, { ex: 26 * 3600 }).catch(() => {});
  return { ...fresh, links };
}
