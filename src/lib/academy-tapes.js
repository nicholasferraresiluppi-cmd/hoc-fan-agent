// Game tape Academy — sequenze di vendita REALI estratte dal warehouse.
//
// Pattern "call library" (Gong) + Evidence-Based Training (aviazione, ICAO 9995):
// il materiale didattico non si inventa, si estrae dalle conversazioni che hanno
// prodotto revenue. Pipeline: acquisti grossi (attributed_transactions) → cluster
// per fan → contesto conversazione (onlyfans.chat, partizionata per created_at)
// → attribuzione operatore via turni CP + check-in reali (loadShiftsForDay).
//
// ATTRIBUZIONE ONESTA (stessa policy di shift-quality.js): finestra con 1
// operatore = "singolo", 2+ = "duo" (non si può dire chi ha scritto), 0 =
// "nessuno". Mai fingere il contrario.
//
// PRIVACY / POLICY:
//   - fan pseudonimizzato (hash) in ogni superficie; lo user_id resta solo nel
//     record KV (superficie SEED) per dedup/debug e viene SEMPRE strippato
//     dalla lettura auth-only (stripTape).
//   - i tape NON entrano in score/comp: materiale didattico e basta (policy
//     "dati fan fuori dallo score by design").
//   - flusso: extract (SEED) → candidato → curatela → publish → visibile agli
//     operatori. Niente arriva agli operatori senza publish esplicito.

import { kv } from "@vercel/kv";
import crypto from "crypto";
import { bqQuery, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { loadShiftsForDay } from "@/lib/shift-quality";

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";

const IDX_ALL = "academy:tapes:index"; // ZSET: member=id, score=totale sequenza ($)
const IDX_PUB = "academy:tapes:published"; // ZSET: member=id, score=published_at (ms)
const KEY = (id) => `academy:tape:${id}`;
const LAST_EXTRACT = "academy:tapes:last_extract";

const SEQ_GAP_MS = 90 * 60000; // acquisti dello stesso fan entro 90' = stessa azione
const CTX_BEFORE_MS = 8 * 3600_000; // contesto: fino a 8h prima del primo acquisto
const CTX_AFTER_MS = 45 * 60000; // e 45' dopo l'ultimo (delivery + semina del prossimo)
const MAX_MSGS = 80; // cap messaggi per tape (centrato sulla chiusura, vedi sliceAroundClose)
const POST_CLOSE_KEEP = 8; // quanti messaggi post-ultimo-acquisto tenere (delivery/semina)
const NEW_FAN_MS = 48 * 3600_000; // primo acquisto di sempre entro 48h = fan nuovo

// Pseudonimo/id NON reversibili: HMAC keyed con un segreto SOLO server (mai nel
// payload operatore), non un hash nudo di input enumerabili (user_id numerico +
// creator_id in chiaro sarebbe deanonimizzabile per forza bruta o conferma).
// Deterministico → l'upsert per-id resta idempotente. Il segreto sta in env; in
// mancanza di un segreto dedicato si riusa il token KV (server-only, alta entropia,
// non esce mai verso il client): l'HMAC non rivela la chiave.
function tapeSecret() {
  return (
    process.env.ACADEMY_TAPE_SECRET ||
    process.env.KV_REST_API_TOKEN ||
    process.env.CRON_SECRET ||
    "academy-tape-dev-only"
  );
}
function fanHmac(creatorId, userId) {
  return crypto.createHmac("sha256", tapeSecret()).update(`${creatorId}:${userId}`).digest("hex");
}
function fanAlias(creatorId, userId) {
  return `Fan ${fanHmac(creatorId, userId).slice(0, 4).toUpperCase()}`;
}

/**
 * Estrae i candidati game-tape per un creator: le top sequenze di acquisto del
 * periodo con la conversazione che le ha prodotte. Upsert idempotente: l'id è
 * deterministico (creator+istante chiusura+fan), la curatela esistente
 * (published/title/coach_notes) sopravvive alla ri-estrazione.
 */
export async function extractTapes({ creatorId, days = 30, minAmount = 100, maxTapes = 12 } = {}) {
  const cid = parseInt(creatorId, 10);
  if (!Number.isInteger(cid) || cid <= 0) throw new Error("creatorId non valido");
  const nDays = Math.min(Math.max(parseInt(days, 10) || 30, 1), 120);
  const minAmt = Math.min(Math.max(Number(minAmount) || 100, 20), 500);
  const maxN = Math.min(Math.max(parseInt(maxTapes, 10) || 12, 1), 30);

  // 1) acquisti grossi in chat (message/tip) del periodo — solo org HOC
  const { rows: purchases } = await bqQuery(
    `SELECT user_id, UNIX_MILLIS(created_at) AS ts, CAST(amount AS FLOAT64) AS amount
     FROM \`${DATA()}.onlyfans.attributed_transactions\`
     WHERE creator_id = ${cid}
       AND organization_id = '${HOC_ORGANIZATION_ID}'
       AND type IN ('message','tip')
       AND calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${nDays} DAY)
       AND CAST(amount AS FLOAT64) >= ${minAmt}
     ORDER BY user_id, created_at`
  );

  // nome creator (cosmetico, best-effort — reach è piccola)
  let creatorName = `#${cid}`;
  try {
    const { rows } = await bqQuery(
      `SELECT ANY_VALUE(creator_name) AS name FROM \`${DATA()}.onlyfans.reach\`
       WHERE creator_id = ${cid} AND organization_id = '${HOC_ORGANIZATION_ID}' AND creator_name IS NOT NULL`
    );
    if (rows?.[0]?.name) creatorName = rows[0].name;
  } catch { /* il nome resta l'id */ }

  const meta = {
    creator_id: cid,
    creator_name: creatorName,
    at: Date.now(),
    params: { days: nDays, min_amount: minAmt, max_tapes: maxN },
    purchases: purchases.length,
    sequences: 0,
    found: 0,
  };
  if (!purchases.length) {
    await kv.set(LAST_EXTRACT, meta);
    return { found: 0, purchases: 0 };
  }

  // 2) cluster per fan: acquisti ravvicinati = una sequenza (un'azione di vendita)
  const seqs = [];
  let cur = null;
  for (const p of purchases) {
    const uid = String(p.user_id);
    if (cur && cur.uid === uid && p.ts - cur.last <= SEQ_GAP_MS) {
      cur.buys.push({ at: p.ts, amount: p.amount });
      cur.last = p.ts;
      cur.total += p.amount;
    } else {
      cur = { uid, buys: [{ at: p.ts, amount: p.amount }], first: p.ts, last: p.ts, total: p.amount };
      seqs.push(cur);
    }
  }
  meta.sequences = seqs.length;
  seqs.sort((a, b) => b.total - a.total);
  const top = seqs.slice(0, maxN);
  const uids = [...new Set(top.map((s) => s.uid))];

  // 3) LTV e primo acquisto di sempre per i fan coinvolti (per il chip nuovo/abituale)
  const { rows: ltvRows } = await bqQuery(
    `SELECT user_id, ROUND(SUM(CAST(amount AS FLOAT64)), 0) AS ltv,
            UNIX_MILLIS(MIN(created_at)) AS first_buy
     FROM \`${DATA()}.onlyfans.attributed_transactions\`
     WHERE creator_id = ${cid} AND organization_id = '${HOC_ORGANIZATION_ID}'
       AND user_id IN (${uids.join(",")})
     GROUP BY user_id`
  );
  const ltvByUid = new Map(ltvRows.map((r) => [String(r.user_id), r]));

  // 4) contesto conversazione in UNA query batched (partition pruning su created_at)
  const tMin = Math.min(...top.map((s) => s.first)) - CTX_BEFORE_MS;
  const tMax = Math.max(...top.map((s) => s.last)) + CTX_AFTER_MS;
  const { rows: msgs } = await bqQuery(
    `SELECT user_id, UNIX_MILLIS(created_at) AS ts,
            IF(sender_id = creator_id, 'op', 'fan') AS who,
            CAST(price AS FLOAT64) AS price, SUBSTR(text, 1, 400) AS text
     FROM \`${DATA()}.onlyfans.chat\`
     WHERE creator_id = ${cid}
       AND organization_id = '${HOC_ORGANIZATION_ID}'
       AND user_id IN (${uids.join(",")})
       AND created_at BETWEEN TIMESTAMP_MILLIS(${tMin}) AND TIMESTAMP_MILLIS(${tMax})
     ORDER BY created_at`,
    // periodi lunghi = molte partizioni della colonna text: cap alzato ma sempre chiuso
    { maxBytesBilled: 8 * 1024 * 1024 * 1024 }
  );
  const msgsByUid = new Map();
  for (const m of msgs) {
    const uid = String(m.user_id);
    if (!msgsByUid.has(uid)) msgsByUid.set(uid, []);
    msgsByUid.get(uid).push(m);
  }

  // 5) attribuzione operatore: turni del giorno della chiusura (cache per giorno)
  const shiftsByDay = new Map();
  async function shiftsFor(day) {
    if (!shiftsByDay.has(day)) {
      try {
        shiftsByDay.set(day, await loadShiftsForDay([cid], day));
      } catch {
        shiftsByDay.set(day, []); // senza wage CP il tape resta valido, solo non attribuito
      }
    }
    return shiftsByDay.get(day);
  }

  const ids = [];
  for (const seq of top) {
    const winStart = seq.first - CTX_BEFORE_MS;
    const winEnd = seq.last + CTX_AFTER_MS;
    const all = (msgsByUid.get(seq.uid) || []).filter((m) => m.ts >= winStart && m.ts <= winEnd);
    if (!all.length) continue; // niente conversazione (es. tip a freddo): non è un tape

    // Slice CENTRATO sulla chiusura: il pitch che chiude la vendita sta PRIMA
    // dell'ultimo acquisto — tenerlo sempre — e solo pochi messaggi della coda
    // post-vendita (delivery + semina). Uno slice(-N) cieco, con la coda a 45',
    // scarterebbe proprio il pitch di chiusura.
    const preClose = all.filter((m) => m.ts <= seq.last);
    const postClose = all.filter((m) => m.ts > seq.last).slice(0, POST_CLOSE_KEEP);
    const preKeep = preClose.slice(-(MAX_MSGS - postClose.length));
    const sliced = [...preKeep, ...postClose];
    const truncated = preClose.length > preKeep.length;

    const day = new Date(seq.last).toISOString().slice(0, 10);
    const shifts = await shiftsFor(day);
    const covering = shifts.filter((s) => s.start <= seq.last && seq.last < s.end);
    const operators = [...new Set(covering.flatMap((s) => s.operators))];
    // "duo" onesto come shift-quality.js: più operatori nella finestra O un turno
    // coperto con coseller (s.duo / s.k>1), non solo quando i nomi distinti sono ≥2.
    const isDuo = covering.some((s) => s.duo || (s.operators || []).length > 1);
    const attribution = operators.length === 0 ? "nessuno" : isDuo || operators.length > 1 ? "duo" : "singolo";

    const ltv = ltvByUid.get(seq.uid);
    const opMsgs = sliced.filter((m) => m.who === "op");
    const firstOp = sliced.find((m) => m.who === "op") || sliced[0];
    // id ANCORATO a seq.first (istante stabile: non cambia se la sequenza si
    // estende in avanti a una ri-estrazione) → l'upsert resta idempotente e la
    // curatela non viene orfanata. Fan token via HMAC keyed (non reversibile).
    const fanTok = fanHmac(cid, seq.uid).slice(0, 8);
    const id = `t${cid}-${Math.floor(seq.first / 1000)}-${fanTok}`;

    const tape = {
      id,
      creator_id: cid,
      creator_name: creatorName,
      fan: fanAlias(cid, seq.uid),
      user_id: seq.uid, // MAI esposto fuori dalla superficie SEED (vedi stripTape)
      total: Math.round(seq.total),
      buys: seq.buys,
      messages: sliced.map((m) => ({ at: m.ts, who: m.who, price: m.price || 0, text: m.text || "" })),
      operators,
      attribution,
      stats: {
        fan_ltv: ltv ? Number(ltv.ltv) : null,
        new_fan: ltv ? seq.first - Number(ltv.first_buy) <= NEW_FAN_MS : null,
        msgs_op: opMsgs.length,
        msgs_fan: sliced.length - opMsgs.length,
        buildup_min: Math.max(1, Math.round((seq.last - firstOp.ts) / 60000)),
        ppv_ladder: opMsgs.filter((m) => m.price > 0).map((m) => m.price),
        truncated,
      },
      period_days: nDays,
      extracted_at: Date.now(),
      published: false,
      published_at: null,
      title: "",
      coach_notes: "",
    };

    // upsert: la curatela sopravvive alla ri-estrazione. Ri-lettura del record
    // il più tardi possibile (subito prima del merge) per minimizzare la finestra
    // TOCTOU con un curateTape concorrente; extract NON è mai la fonte di verità
    // dello stato published — copia quello persistito e riallinea l'indice.
    const prev = await kv.get(KEY(id));
    if (prev) {
      tape.published = Boolean(prev.published);
      tape.published_at = prev.published_at || null;
      tape.title = prev.title || "";
      tape.coach_notes = prev.coach_notes || "";
    }

    await kv.set(KEY(id), tape);
    await kv.zadd(IDX_ALL, { score: tape.total, member: id });
    // riallinea IDX_PUB allo stato published del record (evita membership stantia)
    if (tape.published) {
      await kv.zadd(IDX_PUB, { score: tape.published_at || Date.now(), member: id });
    } else {
      await kv.zrem(IDX_PUB, id);
    }
    ids.push(id);
  }

  meta.found = ids.length;
  await kv.set(LAST_EXTRACT, meta);
  return { found: ids.length, purchases: purchases.length, sequences: seqs.length, ids };
}

/** Lista tape dall'indice (tutti o solo pubblicati), dal più rilevante. */
export async function listTapes({ publishedOnly = false, limit = 60 } = {}) {
  const idx = publishedOnly ? IDX_PUB : IDX_ALL;
  const ids = await kv.zrange(idx, 0, Math.max(0, limit - 1), { rev: true });
  if (!ids?.length) return [];
  const rows = await kv.mget(...ids.map((id) => KEY(id)));
  return (rows || []).filter(Boolean);
}

/** Versione per superfici NON-SEED: via lo user_id, resta solo lo pseudonimo. */
export function stripTape(tape) {
  if (!tape) return tape;
  const { user_id, ...pub } = tape;
  return pub;
}

/** Curatela (SEED): titolo, note del coach, publish/unpublish. */
export async function curateTape(id, patch = {}) {
  const tape = await kv.get(KEY(id));
  if (!tape) throw new Error("Tape non trovato");
  if (typeof patch.title === "string") tape.title = patch.title.slice(0, 140);
  if (typeof patch.coach_notes === "string") tape.coach_notes = patch.coach_notes.slice(0, 2000);
  const togglePub =
    typeof patch.published === "boolean" && patch.published !== tape.published;
  if (togglePub) {
    tape.published = patch.published;
    tape.published_at = patch.published ? Date.now() : null;
  }
  // Persisti PRIMA il record, POI l'indice: se un crash cade tra i due, il record
  // resta la fonte di verità e una ri-estrazione riallinea IDX_PUB al suo flag.
  await kv.set(KEY(id), tape);
  if (togglePub) {
    if (tape.published) await kv.zadd(IDX_PUB, { score: tape.published_at, member: id });
    else await kv.zrem(IDX_PUB, id);
  }
  return tape;
}

export async function lastExtract() {
  return (await kv.get(LAST_EXTRACT)) || null;
}
