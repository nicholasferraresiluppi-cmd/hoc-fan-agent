// S4S — orchestrazione (KV + BigQuery). La logica sta in s4s-core.js (puro, testato).
//
// Nato dal "Calendario S4S Automatico 2.0" su Google Sheets (ott 2026): girone a
// rotazione fermo dopo un giro, nessuna misura. Qui il calendario legge le pagine
// dallo split (sales:splits) e ogni scambio si misura dai link di tracciamento:
// abbonati portati e quanto hanno speso a 30 giorni.
//
// KV:
//   s4s:plan:{splitId}          { settings, segments[] } — segmenti del calendario (lo storico non si sposta)
//   s4s:aliases                 { labelKey → nome base | null } — partner assegnati a mano (vale per tutta HOC)
//   s4s:res:{v}:{splitId}       cache risultati { rows, generated_at } (TTL 2g, ricalcolo >12h)
//   s4s:names:{v}               nomi delle pagine HOC (TTL 1g)
//   s4s:links:{splitId}         { "giorno|ricevente|partner" → { url, at, by } } link incollati a mano
//   s4s:lstat:{v}:{splitId}     cache click/abbonati per link + @handle delle pagine (3h, si rifà se arriva un URL nuovo)
//
// COSTO: la query dei risultati legge ~0,1 GB (misurato 13/10/2026 su 15 pagine, 180 giorni).

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { listSplits } from "@/lib/sales-coaching";
import { S4S_VERSION, groupPages, reconcilePlan, baseName, normalizeLinkUrl, sideKey } from "@/lib/s4s-core";

export { bigQueryConfigured, listSplits };

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const PLAN_KEY = (id) => `s4s:plan:${id}`;
const ALIAS_KEY = "s4s:aliases";
const RES_KEY = (id) => `s4s:res:${S4S_VERSION}:${id}`;
const NAMES_KEY = `s4s:names:${S4S_VERSION}`;
const RES_STALE_H = 12;
const LINKS_KEY = (id) => `s4s:links:${id}`;
const LSTAT_KEY = (id) => `s4s:lstat:${S4S_VERSION}:${id}`;
const LSTAT_STALE_H = 3;
export const WINDOW_DAYS = 180;
export const DEFAULT_WEEKDAYS = [1, 2, 4]; // come il calendario 2.0: lun, mar, gio

const ids = (list) => [...new Set((list || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

// ── Nomi ────────────────────────────────────────────────────────────────────
export async function getNames() {
  const cached = await kv.get(NAMES_KEY);
  if (cached && typeof cached === "object") return cached;
  const { rows } = await bqQuery(
    `SELECT creator_id, ANY_VALUE(creator_name) AS name FROM \`${DATA()}.onlyfans.reach\`
     WHERE organization_id = '${HOC_ORGANIZATION_ID}' GROUP BY creator_id`,
    { maxBytesBilled: 1024 ** 3 }
  );
  const names = Object.fromEntries(rows.filter((r) => r.name).map((r) => [String(r.creator_id), r.name]));
  await kv.set(NAMES_KEY, names, { ex: 24 * 3600 });
  return names;
}

// ── Risultati (link S4S delle pagine dello split) ──────────────────────────
export function resultsSQL(creatorIds) {
  const list = ids(creatorIds).join(",");
  const d = DATA();
  // Spesa a 30 giorni: transazioni dello stesso fan sulla stessa pagina nei 30 giorni
  // dopo l'abbonamento via link. Conta solo per i fan "maturi" (abbonati da ≥30 giorni),
  // altrimenti un link di ieri sembrerebbe valere $0.
  return `
WITH s AS (
  SELECT creator_id, link_name, user_id, MIN(created_at) AS joined_at
  FROM \`${d}.onlyfans.links_subscriptions\`
  WHERE organization_id = '${HOC_ORGANIZATION_ID}'
    AND creator_id IN (${list})
    AND calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${WINDOW_DAYS} DAY)
    AND REGEXP_CONTAINS(LOWER(link_name), r's4s|sfs|shout')
  GROUP BY 1, 2, 3),
t AS (
  SELECT creator_id, user_id, created_at, net
  FROM \`${d}.onlyfans.attributed_transactions\`
  WHERE organization_id = '${HOC_ORGANIZATION_ID}'
    AND creator_id IN (${list})
    AND calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${WINDOW_DAYS} DAY)),
sp AS (
  SELECT s.creator_id, s.link_name, s.user_id, SUM(t.net) AS net30
  FROM s JOIN t ON t.creator_id = s.creator_id AND t.user_id = s.user_id
    AND t.created_at >= s.joined_at AND t.created_at < TIMESTAMP_ADD(s.joined_at, INTERVAL 30 DAY)
  GROUP BY 1, 2, 3)
SELECT s.creator_id, s.link_name,
  COUNT(DISTINCT s.user_id) AS subs,
  MIN(DATE(s.joined_at)) AS first_day,
  MAX(DATE(s.joined_at)) AS last_day,
  COUNTIF(DATE(s.joined_at) <= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) AS mature_subs,
  SUM(IF(DATE(s.joined_at) <= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY), IFNULL(sp.net30, 0), 0)) AS mature_net30,
  COUNTIF(sp.net30 > 0 AND DATE(s.joined_at) <= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) AS mature_payers
FROM s
LEFT JOIN sp USING (creator_id, link_name, user_id)
GROUP BY 1, 2
ORDER BY first_day DESC`;
}

// Incasso netto a 30 giorni dei fan arrivati dagli altri link (non S4S): il termine di paragone.
export function baselineSQL(creatorIds) {
  const list = ids(creatorIds).join(",");
  const d = DATA();
  return `
WITH s AS (
  SELECT creator_id, user_id, MIN(created_at) AS joined_at
  FROM \`${d}.onlyfans.links_subscriptions\`
  WHERE organization_id = '${HOC_ORGANIZATION_ID}' AND creator_id IN (${list})
    AND calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${WINDOW_DAYS} DAY)
    AND link_name IS NOT NULL AND NOT REGEXP_CONTAINS(LOWER(link_name), r's4s|sfs|shout')
  GROUP BY 1, 2
  HAVING DATE(MIN(created_at)) <= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)),
t AS (
  SELECT creator_id, user_id, created_at, net FROM \`${d}.onlyfans.attributed_transactions\`
  WHERE organization_id = '${HOC_ORGANIZATION_ID}' AND creator_id IN (${list})
    AND calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${WINDOW_DAYS} DAY))
SELECT COUNT(DISTINCT FORMAT('%d|%d', s.creator_id, s.user_id)) AS fans, SUM(IFNULL(t.net, 0)) AS net30
FROM s LEFT JOIN t ON t.creator_id = s.creator_id AND t.user_id = s.user_id
  AND t.created_at >= s.joined_at AND t.created_at < TIMESTAMP_ADD(s.joined_at, INTERVAL 30 DAY)`;
}

export async function getResults(splitId, creatorIds, { force = false } = {}) {
  const cached = await kv.get(RES_KEY(splitId));
  const sameIds = cached && ids(cached.creator_ids).sort().join() === ids(creatorIds).sort().join();
  const fresh = cached && sameIds && Date.now() - Date.parse(cached.generated_at) < RES_STALE_H * 3600 * 1000;
  if (fresh && !force) return cached;
  const [{ rows, totalBytesProcessed }, base] = await Promise.all([
    bqQuery(resultsSQL(creatorIds), { maxBytesBilled: 4 * 1024 ** 3, timeoutMs: 45_000 }),
    bqQuery(baselineSQL(creatorIds), { maxBytesBilled: 4 * 1024 ** 3, timeoutMs: 45_000 }),
  ]);
  const b = base.rows[0] || {};
  const out = {
    rows: rows.map((r) => ({ ...r, first_day: String(r.first_day).slice(0, 10), last_day: String(r.last_day).slice(0, 10) })),
    // confronto: i fan arrivati dagli ALTRI link (non S4S) delle stesse pagine, stessa regola dei 30 giorni
    baseline: { fans: Number(b.fans) || 0, net30: Number(b.net30) || 0 },
    creator_ids: ids(creatorIds),
    generated_at: new Date().toISOString(),
    bytes_processed: totalBytesProcessed + (base.totalBytesProcessed || 0),
  };
  await kv.set(RES_KEY(splitId), out, { ex: 2 * 24 * 3600 });
  return out;
}

// ── Alias manuali ───────────────────────────────────────────────────────────
export async function getAliases() {
  const v = await kv.get(ALIAS_KEY);
  return v && typeof v === "object" ? v : {};
}

export async function setAlias(labelKey, partner) {
  const k = String(labelKey || "").trim().slice(0, 80);
  if (!k) throw new Error("Testo del link mancante");
  const map = await getAliases();
  if (partner === undefined) delete map[k];
  else map[k] = partner ? baseName(String(partner).slice(0, 80)) : null;
  await kv.set(ALIAS_KEY, map);
  return map;
}

// ── Piano ───────────────────────────────────────────────────────────────────
const cleanSettings = (s = {}) => ({
  weekdays: Array.isArray(s.weekdays) && s.weekdays.length
    ? [...new Set(s.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : DEFAULT_WEEKDAYS,
  start: /^\d{4}-\d{2}-\d{2}$/.test(String(s.start || "")) ? s.start : null,
  lang_override: Object.fromEntries(
    Object.entries(s.lang_override || {}).filter(([k, v]) => /^\d+$/.test(k) && /^[a-z]{2}$/.test(String(v)))
  ),
  paused: ids(s.paused),
});

export async function getPlan(splitId) {
  const v = await kv.get(PLAN_KEY(splitId));
  return v && typeof v === "object" ? v : null;
}

// Allinea il piano allo split e alle impostazioni. Scrive in KV solo se cambia qualcosa.
export async function syncPlan(split, names, today, { settings: patch, userId } = {}) {
  const stored = await getPlan(split.id);
  const settings = cleanSettings({ ...(stored?.settings || {}), ...(patch || {}) });
  if (!settings.weekdays.length) throw new Error("Scegli almeno un giorno");
  const pages = split.creator_ids.map((id) => ({ id, name: names[String(id)] || String(id) }));
  const groups = groupPages(pages, { langOverride: settings.lang_override, paused: settings.paused });

  // data di inizio cambiata prima che il calendario parta → si riparte da zero
  let base = stored;
  const first = stored?.segments?.[0];
  if (patch?.start && first && first.from > today && settings.start !== first.from) base = { ...stored, segments: [] };

  const { plan, changed } = reconcilePlan(base, { splitId: split.id, groups, weekdays: settings.weekdays, start: settings.start, today });
  const settingsChanged = JSON.stringify(stored?.settings || null) !== JSON.stringify(settings);
  const out = { ...plan, settings };
  if (changed || settingsChanged || !stored) {
    out.updated_at = new Date().toISOString();
    out.updated_by = userId || stored?.updated_by || null;
    await kv.set(PLAN_KEY(split.id), out);
  }
  return { plan: out, pages };
}

// ── Link incollati a mano ───────────────────────────────────────────────────
export async function getLinks(splitId) {
  const v = await kv.get(LINKS_KEY(splitId));
  return v && typeof v === "object" ? v : {};
}

// url vuoto/null = togli. Ritorna la mappa aggiornata.
export async function setLink(splitId, { day, receiver, partner, url }, userId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) throw new Error("Giorno non valido");
  const r = Number(receiver), p = Number(partner);
  if (!Number.isInteger(r) || !Number.isInteger(p)) throw new Error("Scambio non valido");
  const map = await getLinks(splitId);
  const k = sideKey(day, r, p);
  if (!url) delete map[k];
  else {
    const n = normalizeLinkUrl(url);
    if (!n) throw new Error("Non sembra un link di tracciamento OnlyFans (onlyfans.com/<pagina>/c<numero>)");
    const dup = Object.entries(map).find(([kk, v]) => kk !== k && v.url === n);
    if (dup) throw new Error(`Questo link è già incollato su un altro scambio (${dup[0].slice(8, 10)}/${dup[0].slice(5, 7)})`);
    map[k] = { url: n, at: new Date().toISOString(), by: userId || null };
  }
  await kv.set(LINKS_KEY(splitId), map);
  return map;
}

// Click/abbonati dell'ultimo giorno disponibile per ogni link S4S delle pagine (e per ogni URL
// incollato, qualunque sia il nome) + @handle delle pagine. links_stats è una fotografia giornaliera.
export function linkStatsSQL(creatorIds, urls = []) {
  const list = ids(creatorIds).join(",");
  const d = DATA();
  const safe = urls.map(normalizeLinkUrl).filter(Boolean).map((u) => `'${u}'`);
  const urlCond = safe.length ? ` OR REGEXP_REPLACE(LOWER(link_url), r'^https?://(www\\.)?', '') IN (${safe.join(",")})` : "";
  return `
WITH l AS (
  SELECT creator_id, link_name, link_url, creation_date, clicks, subs, calendar_date
  FROM \`${d}.onlyfans.links_stats\`
  WHERE organization_id = '${HOC_ORGANIZATION_ID}' AND creator_id IN (${list})
    AND calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)),
latest AS (
  SELECT * FROM l
  WHERE DATE(creation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${WINDOW_DAYS} DAY)
    AND (REGEXP_CONTAINS(LOWER(link_name), r's4s|sfs|shout')${urlCond})
  QUALIFY ROW_NUMBER() OVER (PARTITION BY link_url ORDER BY calendar_date DESC) = 1),
h AS (
  SELECT creator_id, REGEXP_EXTRACT(LOWER(link_url), r'onlyfans\\.com/([^/]+)/') AS handle, COUNT(*) AS n
  FROM l GROUP BY 1, 2
  QUALIFY ROW_NUMBER() OVER (PARTITION BY creator_id ORDER BY n DESC) = 1)
SELECT 'link' AS kind, creator_id, link_name, link_url, CAST(creation_date AS STRING) AS created, clicks, subs, NULL AS handle FROM latest
UNION ALL
SELECT 'handle', creator_id, NULL, NULL, NULL, NULL, NULL, handle FROM h`;
}

export async function getLinkStats(splitId, creatorIds, urls, { force = false } = {}) {
  const cached = await kv.get(LSTAT_KEY(splitId));
  const want = [...new Set(urls.map(normalizeLinkUrl).filter(Boolean))].sort();
  const covered = cached && want.every((u) => cached.urls?.includes(u));
  const fresh = cached && covered && Date.now() - Date.parse(cached.generated_at) < LSTAT_STALE_H * 3600 * 1000;
  if (fresh && !force) return cached;
  const { rows } = await bqQuery(linkStatsSQL(creatorIds, want), { maxBytesBilled: 2 * 1024 ** 3, timeoutMs: 30_000 });
  const links = {};
  const handles = {};
  for (const r of rows) {
    if (r.kind === "handle") { if (r.handle) handles[String(r.creator_id)] = r.handle; continue; }
    const n = normalizeLinkUrl(r.link_url);
    if (!n) continue;
    links[n] = { creator_id: Number(r.creator_id), link_name: r.link_name, created: String(r.created || "").slice(0, 10), clicks: Number(r.clicks) || 0, subs: Number(r.subs) || 0 };
  }
  const out = { links, handles, urls: want, generated_at: new Date().toISOString() };
  await kv.set(LSTAT_KEY(splitId), out, { ex: 2 * 24 * 3600 });
  return out;
}

// ── Accordi ─────────────────────────────────────────────────────────────────
// KV s4s:deals:{splitId} = { id → accordo }. Solo ciò che qualcuno ha toccato: le
// proposte del giro non salvate restano virtuali (s4s-core mergeDeals).
const DEALS_KEY = (id) => `s4s:deals:${id}`;
export async function getDeals(splitId) {
  const v = await kv.get(DEALS_KEY(splitId));
  return v && typeof v === "object" ? v : {};
}
export async function putDeals(splitId, map) {
  // pulizia: accordi più vecchi di 120 giorni non servono più al calendario
  const cutoff = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  for (const [k, d] of Object.entries(map)) if (d.day < cutoff) delete map[k];
  await kv.set(DEALS_KEY(splitId), map);
  return map;
}

// ── Disponibilità per pagina (punto 3) ──────────────────────────────────────
// KV s4s:avail:{creatorId} = { per_week, weekdays, times, formats, exclude, updated_at, updated_by }
const AVAIL_KEY = (cid) => `s4s:avail:${Number(cid)}`;
export async function getAvails(ids) {
  const list = [...new Set(ids.map(Number))];
  if (!list.length) return {};
  const vals = await kv.mget(...list.map(AVAIL_KEY));
  return Object.fromEntries(list.map((id, i) => [id, vals[i] && typeof vals[i] === "object" ? vals[i] : null]));
}
export async function saveAvail(cid, clean, uid) {
  const out = { ...clean, updated_at: new Date().toISOString(), updated_by: uid || null };
  await kv.set(AVAIL_KEY(cid), out);
  return out;
}
