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
//
// COSTO: la query dei risultati legge ~0,1 GB (misurato 13/10/2026 su 15 pagine, 180 giorni).

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { listSplits } from "@/lib/sales-coaching";
import { S4S_VERSION, groupPages, reconcilePlan, baseName } from "@/lib/s4s-core";

export { bigQueryConfigured, listSplits };

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const PLAN_KEY = (id) => `s4s:plan:${id}`;
const ALIAS_KEY = "s4s:aliases";
const RES_KEY = (id) => `s4s:res:${S4S_VERSION}:${id}`;
const NAMES_KEY = `s4s:names:${S4S_VERSION}`;
const RES_STALE_H = 12;
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

export async function getResults(splitId, creatorIds, { force = false } = {}) {
  const cached = await kv.get(RES_KEY(splitId));
  const sameIds = cached && ids(cached.creator_ids).sort().join() === ids(creatorIds).sort().join();
  const fresh = cached && sameIds && Date.now() - Date.parse(cached.generated_at) < RES_STALE_H * 3600 * 1000;
  if (fresh && !force) return cached;
  const { rows, totalBytesProcessed } = await bqQuery(resultsSQL(creatorIds), { maxBytesBilled: 4 * 1024 ** 3, timeoutMs: 45_000 });
  const out = {
    rows: rows.map((r) => ({ ...r, first_day: String(r.first_day).slice(0, 10), last_day: String(r.last_day).slice(0, 10) })),
    creator_ids: ids(creatorIds),
    generated_at: new Date().toISOString(),
    bytes_processed: totalBytesProcessed,
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
