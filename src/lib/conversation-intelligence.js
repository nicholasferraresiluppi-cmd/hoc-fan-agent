// Conversation Intelligence · Tier-1 (metadata-only) — orchestrazione lato-app.
//
// Legge da BigQuery (hoc.ws_chat via connettore SA, SOLO LETTURA, nessun testo dei
// messaggi) i segnali strutturali di presidio chat per creator × giorno, li aggrega
// su 7 giorni completi e li classifica per qualità del presidio (peggiore prima).
//
// Grana: CREATOR (account), NON singolo operatore — l'attribuzione per-operatore è
// il join sul turno (pattern payout-match.js), fase 2 gated. Vedi docs/CONVERSATION_INTELLIGENCE.md.

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID, hocCreatorScopeSQL } from "@/lib/bigquery-api";
import { CI_TIER1_SQL } from "@/lib/conversation-intelligence-sql";

const CACHE_KEY = "bq:ci:tier1";
const CACHE_TTL = 6 * 3600; // 6h — i dati sono giornalieri, non serve interrogare a ogni richiesta
const MIN_MSGS_DAY = 500; // filtra creator senza volume conversazionale reale

function dataProject() {
  return process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
}

// Mappa creator_id → nome (da onlyfans.reach, stesso id space di ws_chat). Best-effort.
// Ristretta all'org HOC per non mappare (né esporre) nomi di altre agenzie.
async function fetchNames() {
  try {
    const { rows } = await bqQuery(
      `SELECT DISTINCT creator_id, creator_name FROM \`${dataProject()}.onlyfans.reach\` WHERE creator_name IS NOT NULL AND organization_id = '${HOC_ORGANIZATION_ID}'`
    );
    const map = {};
    for (const r of rows) map[String(r.creator_id)] = r.creator_name;
    return map;
  } catch {
    return {}; // i nomi sono cosmetici: se il join fallisce si mostrano gli id
  }
}

// Aggrega per creator sui giorni COMPLETI (esclude is_partial_day). Rate pesati per fan_openers.
function aggregate(rows, names) {
  const agg = {};
  for (const r of rows) {
    if (String(r.is_partial_day) === "true") continue;
    const k = String(r.creator_id);
    const a = agg[k] || (agg[k] = { days: 0, msgs: 0, fan: 0, personal: 0, openers: 0, answered: 0, w5: 0, w15: 0, p90: 0 });
    a.days++;
    a.msgs += Number(r.messages);
    a.fan += Number(r.fan_msgs);
    a.personal += Number(r.creatorside_personal_msgs);
    a.openers += Number(r.fan_openers);
    a.answered += Number(r.answered_openers);
    a.w5 += Number(r.pct_within_5min) * Number(r.fan_openers);
    a.w15 += Number(r.pct_within_15min) * Number(r.fan_openers);
    a.p90 += Number(r.frt_p90_sec);
  }
  return Object.entries(agg)
    .map(([id, a]) => ({
      creator_id: id,
      creator: names[id] || `#${id}`,
      msgs_day: a.days ? Math.round(a.msgs / a.days) : 0,
      ratio: a.fan ? +(a.personal / a.fan).toFixed(2) : null,
      response_rate: a.openers ? +(a.answered / a.openers).toFixed(4) : null,
      within_5min: a.openers ? +(a.w5 / a.openers).toFixed(4) : null,
      within_15min: a.openers ? +(a.w15 / a.openers).toFixed(4) : null,
      frt_p90_min: a.days ? +(a.p90 / a.days / 60).toFixed(1) : null,
    }))
    .filter((r) => r.msgs_day >= MIN_MSGS_DAY)
    .sort((x, y) => (x.within_5min ?? 1) - (y.within_5min ?? 1)); // peggior presidio prima
}

// Applica lo scope tenant HOC alla CI Tier-1 SQL. `ws_chat` non ha organization_id,
// quindi si inietta il filtro (via reach) come ultima condizione del WHERE della CTE
// `base`, subito prima della QUALIFY. FAIL-CLOSED: se l'ancora non c'è più (SQL
// modificata a monte) si lancia, invece di eseguire senza filtro e leakare altri tenant.
function scopedCITier1SQL() {
  const anchor = "QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY commit_timestamp DESC) = 1";
  if (!CI_TIER1_SQL.includes(anchor)) {
    throw new Error(
      "CI Tier-1 SQL: ancora per lo scope org non trovata → filtro tenant NON applicabile, abort per sicurezza"
    );
  }
  return CI_TIER1_SQL.replace(anchor, `AND ${hocCreatorScopeSQL(dataProject())}\n  ${anchor}`);
}

export async function getConversationIntelligence({ force = false } = {}) {
  if (!force) {
    const cached = await kv.get(CACHE_KEY);
    if (cached) return { ...cached, cached: true };
  }
  const [tier1, names] = await Promise.all([bqQuery(scopedCITier1SQL()), fetchNames()]);
  const byCreator = aggregate(tier1.rows, names);
  const payload = {
    by_creator: byCreator,
    creators: byCreator.length,
    day_rows: tier1.rows.length,
    bytes_processed: tier1.totalBytesProcessed,
    generated_at: new Date().toISOString(),
  };
  await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL });
  return { ...payload, cached: false };
}

export { bigQueryConfigured };
