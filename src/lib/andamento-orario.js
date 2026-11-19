// Andamento per ora (19/11/2026) — legge il warehouse e costruisce la vista (lib/andamento-orario-core.js).
//
// FONTE: il warehouse `BIGQUERY_DATA_PROJECT`; se l'accesso viene tolto, la copia di sicurezza nostra
// `<billing>.warehouse_backup.onlyfans__<tabella>` (il dataset onlyfans è copiato per intero ogni notte).
// CACHE: il periodo 15 minuti, «oggi» 5 minuti (le transazioni arrivano dal vivo). In KV va la vista già
// calcolata, non le righe (banda KV: vedi incidente Upstash ott 2026).
// COSTO misurato (28 giorni, 45 pagine): 0,05 GB transazioni + 1,2 GB messaggi + 0,02 GB oggi.

import { kv } from "@vercel/kv";
import { bqQuery, bqProjects, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { splitCreators } from "@/lib/analisi-vendite";
import { personOf } from "@/lib/analisi-vendite-diagnosi";
import { txHourlySql, activityHourlySql, todaySql, insideHourSql } from "@/lib/andamento-orario-sql";
import { buildInsideHour } from "@/lib/andamento-ora-core";
import { buildAndamento, buildToday, reading, normalizePeriod, romeNow, addDays, MAX_DAYS } from "@/lib/andamento-orario-core";
export { MAX_DAYS };

const VERSION = "ao-2";

const TABLES = {
  attributed: ["onlyfans", "attributed_transactions"],
  mass: ["onlyfans", "mass_transactions"],
  chat: ["onlyfans", "chat"],
  organicSubs: ["onlyfans", "organic_subscriptions"],
  shifts: ["onlyfans", "cache_members"],
  subs: ["onlyfans", "subscriptions_intervals"],
};
function refsFor(source) {
  const { dataProject, billingProject } = bqProjects();
  return Object.fromEntries(Object.entries(TABLES).map(([k, [ds, t]]) => [
    k, source === "backup" ? `${billingProject}.warehouse_backup.${ds}__${t}` : `${dataProject}.${ds}.${t}`,
  ]));
}
const lostAccess = (e) => /access denied|permission|not found: (dataset|table)|\b40[34]\b/i.test(String(e?.message || ""));
async function run(build) {
  const opts = { maxBytesBilled: 12 * 1024 ** 3, timeoutMs: 45_000 };
  try {
    return { source: "warehouse", rows: await Promise.all(build(refsFor("warehouse")).map((sql) => bqQuery(sql, opts).then((r) => r.rows))) };
  } catch (e) {
    if (!lostAccess(e)) throw e;
    return { source: "backup", rows: await Promise.all(build(refsFor("backup")).map((sql) => bqQuery(sql, opts).then((r) => r.rows))) };
  }
}

/** Pagine visibili raggruppate per persona (IT + EN insieme), per il selettore. */
export function personsOf(creators) {
  const m = new Map();
  for (const c of creators) {
    const p = personOf(c.name);
    if (!m.has(p)) m.set(p, { person: p, ids: [], pages: [] });
    m.get(p).ids.push(c.id);
    m.get(p).pages.push({ id: c.id, name: c.name });
  }
  return [...m.values()].sort((a, b) => a.person.localeCompare(b.person, "it"));
}

export async function getAndamento(ids, query = {}, { force = false, now = new Date() } = {}) {
  const { cur, prev } = normalizePeriod(query, now);
  const rn = romeNow(now);
  // i messaggi arrivano una volta al giorno (taglio alle 05:00 UTC): prima di quell'ora manca anche ieri
  const chatTo = addDays(rn.day, now.getUTCHours() >= 6 ? -1 : -2);
  const sorted = [...new Set(ids.map(Number))].sort((a, b) => a - b);
  const idKey = sorted.join(",");
  const creators = await splitCreators();
  const names = Object.fromEntries(creators.map((c) => [c.id, c.name]));

  const pKey = `andamento:${VERSION}:${cur.from}:${cur.to}:${chatTo}:${idKey}`;
  let base = force ? null : await kv.get(pKey).catch(() => null);
  if (!base) {
    const a = { ids: sorted, org: HOC_ORGANIZATION_ID, cur, prev, chatTo };
    const { source, rows } = await run((refs) => [txHourlySql(refs, a), activityHourlySql(refs, a)]);
    const built = buildAndamento({ tx: rows[0], act: rows[1] }, { cur, prev, chatTo, names, personOf });
    delete built.today;
    delete built.reading;
    base = { ...built, source, computed_at: new Date().toISOString() };
    await kv.set(pKey, base, { ex: 15 * 60 }).catch(() => {});
  }

  const tKey = `andamento:${VERSION}:oggi:${rn.day}:${rn.hour}:${idKey}`;
  let today = force ? null : await kv.get(tKey).catch(() => null);
  if (!today) {
    const { rows } = await run((refs) => [todaySql(refs, { ids: sorted, org: HOC_ORGANIZATION_ID, today: rn.day })]);
    today = { ...buildToday(rows[0], { todayDay: rn.day, nowHour: rn.hour, now }), computed_at: new Date().toISOString() };
    await kv.set(tKey, today, { ex: 5 * 60 }).catch(() => {});
  }
  const out = { ...base, today };
  out.reading = reading(out);
  return out;
}

/**
 * Dentro un'ora: da cosa è fatto l'incasso dell'ora `h` nei giorni del periodo (lib/andamento-ora-core).
 * Legge lo storico dei fan dell'ora (~1,2 GB): cache 15 minuti, e per un periodo già chiuso 6 ore.
 */
export async function getInsideHour(ids, query = {}, h, { force = false, now = new Date() } = {}) {
  const { cur } = normalizePeriod(query, now);
  const hour = Number(h);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("Ora non valida (0-23)");
  const sorted = [...new Set(ids.map(Number))].sort((a, b) => a - b);
  const key = `andamento:${VERSION}:ora:${cur.from}:${cur.to}:${hour}:${sorted.join(",")}`;
  const hit = force ? null : await kv.get(key).catch(() => null);
  if (hit) return hit;
  const creators = await splitCreators();
  const names = Object.fromEntries(creators.map((c) => [c.id, c.name]));
  const { source, rows } = await run((refs) => [insideHourSql(refs, { ids: sorted, org: HOC_ORGANIZATION_ID, from: cur.from, to: cur.to, h: hour })]);
  const out = { ...buildInsideHour(rows[0], { h: hour, from: cur.from, to: cur.to, names, personOf }), source, computed_at: new Date().toISOString() };
  await kv.set(key, out, { ex: 6 * 3600 }).catch(() => {});
  return out;
}
