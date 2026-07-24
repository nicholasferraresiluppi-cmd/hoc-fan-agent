// Infloww ingest — accumulo dei profili-segnali per operatore dagli export scoped.
//
// MODELLO: il client parsa l'export (piccolo, scoped per-operatore per via del tetto
// 500k messaggi di Infloww), calcola i segnali con computeInflowwOperatorSignals
// (i messaggi grezzi NON lasciano il browser — solo gli aggregati arrivano qui) e
// li manda. Qui si fa UPSERT per operatore: l'ultimo upload di un operatore vince
// (niente doppi conteggi su ri-upload dello stesso periodo); la COPERTURA cresce
// man mano che si aggiungono operatori. È coaching, non score/comp.

import { kv } from "@vercel/kv";

export const INFLOWW_INGEST_VERSION = "infloww-ingest-1-2026-07";
const STORE_KEY = `infloww:opsig:store:${INFLOWW_INGEST_VERSION}`;

const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const clean = (s) => String(s || "").trim().slice(0, 120);

const RESERVED = new Set(["__proto__", "constructor", "prototype"]);

// Sanifica un profilo in arrivo dal client (difesa: non fidarsi del payload).
function sanitizeProfile(p) {
  const operator = clean(p?.operator);
  // scarta chiavi riservate: `store.profiles["__proto__"]=…` toccherebbe il
  // prototipo invece di aggiungere una voce (count/list incoerenti).
  if (!operator || RESERVED.has(operator)) return null;
  const msgs = Math.max(0, Math.floor(num(p?.msgs) || 0));
  if (msgs <= 0) return null;
  return {
    operator,
    msgs,
    question_rate: clampRate(num(p?.question_rate)),
    avg_ppv_price: num(p?.avg_ppv_price) != null ? Math.max(0, Number(p.avg_ppv_price)) : null,
    ppv_share: clampRate(num(p?.ppv_share)),
  };
}
function clampRate(v) {
  if (v == null) return null;
  return Math.min(1, Math.max(0, v));
}

export async function getInflowwStore() {
  const store = await kv.get(STORE_KEY);
  if (!store || typeof store !== "object" || !store.profiles) {
    return { version: INFLOWW_INGEST_VERSION, profiles: {}, count: 0, updated_at: null };
  }
  return store;
}

/**
 * Upsert dei profili in arrivo. `meta` = { period_from, period_to, rows } (opzionale),
 * `now` = timestamp iniettato (i cron/route lo passano; niente Date.now implicito nei test).
 * Ritorna lo store aggiornato.
 */
// NB atomicità: read-modify-write non transazionale. Va bene per la cadenza reale
// (upload manuali, un admin alla volta); due tab concorrenti potrebbero perdere un
// update. Se un giorno serve indurirlo: lock KV o accumulo per-delta invece del set.
export async function upsertInflowwProfiles(profiles, meta = {}, now = Date.now()) {
  const store = await getInflowwStore();
  const period =
    meta && (meta.period_from || meta.period_to)
      ? { from: clean(meta.period_from) || null, to: clean(meta.period_to) || null }
      : null;

  let applied = 0;
  for (const raw of Array.isArray(profiles) ? profiles : []) {
    const p = sanitizeProfile(raw);
    if (!p) continue;
    store.profiles[p.operator] = { ...p, updated_at: now, period };
    applied++;
  }
  store.count = Object.keys(store.profiles).length;
  store.updated_at = now;
  store.version = INFLOWW_INGEST_VERSION;
  await kv.set(STORE_KEY, store);
  return { store, applied };
}

/** Rimuove un singolo operatore. */
export async function removeInflowwProfile(operator) {
  const store = await getInflowwStore();
  delete store.profiles[clean(operator)];
  store.count = Object.keys(store.profiles).length;
  await kv.set(STORE_KEY, store);
  return store;
}

/** Svuota tutto lo store (azione distruttiva, con traccia di audit). */
export async function clearInflowwStore(now = Date.now()) {
  const store = await getInflowwStore();
  const wiped = store.count || 0;
  store.profiles = {};
  store.count = 0;
  store.updated_at = now;
  await kv.set(STORE_KEY, store);
  try {
    await kv.lpush("infloww:ingest:audit", { at: now, action: "wipe", wiped });
    await kv.ltrim("infloww:ingest:audit", 0, 199);
  } catch {
    /* audit best-effort, non deve far fallire lo svuotamento */
  }
  return store;
}

/** Lista piatta ordinata per messaggi (per la UI). */
export function storeToList(store) {
  return Object.values(store?.profiles || {}).sort((a, b) => (b.msgs || 0) - (a.msgs || 0));
}
