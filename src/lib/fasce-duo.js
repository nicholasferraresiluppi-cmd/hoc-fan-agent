/**
 * Fasce → «Due operatori» (26/10/2026): lettura dal warehouse e cache. La logica sta in
 * fasce-duo-core.js (puro, testato); qui solo I/O.
 *
 * Una query BigQuery (~2,3 GB ≈ 1,5 centesimi) sulle ultime 12 settimane → celle compatte
 * pagina × fascia × traffico in KV `fasce:duo:{versione}`. La pagina legge solo quella
 * chiave e fa il confronto al volo (così lo split si filtra senza ricalcolare).
 * Ricalcolo dalla funzione notturna della Squadra, solo se il dato ha più di 20 ore.
 */
import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { getWages } from "@/lib/cp-wages-store";
import { currentMonthRome } from "@/lib/squadra";
import { shiftMonth } from "@/lib/squadra-core";
import { FASCE_DUO_VERSION, WINDOW_WEEKS, toCells } from "@/lib/fasce-duo-core";
import { duoSQL } from "@/lib/fasce-duo-sql";

const DATA_KEY = `fasce:duo:${FASCE_DUO_VERSION}`;
const LOCK_KEY = "fasce:duo:lock";
const REFRESH_AFTER_H = 20;
const PROJECT = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";

const romeDay = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));

/** Quota del venduto attribuito pagata agli operatori (buste CP degli ultimi 3 mesi). */
async function commissionRate(now) {
  const cur = currentMonthRome(now);
  let earned = 0;
  let attributed = 0;
  for (const m of [shiftMonth(cur, -2), shiftMonth(cur, -1), cur]) {
    for (const w of (await getWages(m)) || []) {
      earned += Number(w.total_earnings_from_takes) || 0;
      attributed += Number(w.total_attributed_from_takes) || 0;
    }
  }
  return attributed > 0 ? Math.round((earned / attributed) * 1000) / 1000 : null;
}

export async function computeFasceDuo({ now = Date.now() } = {}) {
  const to = romeDay(now); // escluso: si guardano i giorni chiusi
  const from = romeDay(Date.parse(`${to}T12:00:00Z`) - WINDOW_WEEKS * 7 * 86400000);
  const { rows } = await bqQuery(duoSQL({ from, to, project: PROJECT(), org: HOC_ORGANIZATION_ID }), { maxBytesBilled: 6 * 1024 ** 3, timeoutMs: 60_000 });
  const cells = toCells(rows);
  const commission = await commissionRate(now).catch(() => null);
  const doc = { version: FASCE_DUO_VERSION, generated_at: new Date(now).toISOString(), window: { from, to }, hours: rows.length, cells, commission };
  await kv.set(DATA_KEY, doc, { ex: 9 * 24 * 3600 });
  return doc;
}

/** Calcolo con lock: null se un altro lo sta già facendo. */
export async function computeFasceDuoOnce(opts) {
  const got = await kv.set(LOCK_KEY, Date.now(), { nx: true, ex: 240 });
  if (!got) return null;
  try {
    return await computeFasceDuo(opts);
  } finally {
    await kv.del(LOCK_KEY).catch(() => {});
  }
}

/** Dal cron notturno: ricalcola solo se il dato manca o ha più di 20 ore. */
export async function warmFasceDuo({ now = Date.now() } = {}) {
  if (!bigQueryConfigured()) return "skip:no-bq";
  const doc = await getFasceDuoData().catch(() => null);
  if (doc?.generated_at && now - Date.parse(doc.generated_at) < REFRESH_AFTER_H * 3600 * 1000) return "fresh";
  const done = await computeFasceDuoOnce({ now });
  return done ? { hours: done.hours, cells: done.cells.length } : "già in corso";
}

export const getFasceDuoData = () => kv.get(DATA_KEY);
export const isFasceDuoComputing = async () => Boolean(await kv.get(LOCK_KEY));
