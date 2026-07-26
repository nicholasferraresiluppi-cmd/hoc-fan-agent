// Game film operatore — vinte da imitare, perse da correggere, dal lavoro VERO.
//
// Il drill-down formativo del profilo-segnali: dai turni a operatore SINGOLO
// (attribuzione pulita, stessa CTE di operator-signals.js) estrae per ogni fan
// la conversazione del turno e la incrocia con le vendite reali
// (attributed_transactions) → classifica i MOMENTI (game-film-core.js):
//   VINTA  = il fan ha comprato ≥ $100 nella finestra turno (+2h di coda)
//   PERSA  = fan ingaggiato (≥15 msg) uscito a $0 con gioco PPV assente/timido
// e accoppia ogni persa alla sua VINTA GEMELLA (stesso creator prima di tutto,
// poi ingaggio più vicino; se nessuna vinta sullo stesso creator, il fallback
// cross-creator è DICHIARATO in UI col badge "creator diverso" — contesto e
// pricing cambiano, mai spacciarlo per stesso contesto):
// "come potevi giocarla" mostrato con la SUA chat riuscita, non con la teoria.
//
// GOVERNANCE (eredita academy-tapes/operator-signals):
//   - fan SEMPRE pseudonimizzato (fanAlias HMAC condiviso coi game tape); lo
//     user_id grezzo NON entra nel payload di risposta.
//   - i transcript portano testo fan → SOLO superficie SEED (admin/coach).
//     Il publish operatore-facing richiederebbe la curatela con gate PII dei
//     tape: NON costruito in v1, dichiarato.
//   - coaching, non score/comp. La coda +2h attribuisce al turno anche la
//     chiusura a cavallo di fine turno: INDICATIVA, mai contabile.

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { fanAlias, fanHmac } from "@/lib/academy-tapes";
import { upsertFromFilm } from "@/lib/film-library";
import {
  GAME_FILM_VERSION,
  classifyMoments,
  pairTwins,
  momentKey,
  trimTranscript,
  ppvLadder,
} from "@/lib/game-film-core";

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const CAP = 8 * 1024 * 1024 * 1024;
const CACHE_TTL = 6 * 3600; // on-demand con cache breve: il film cambia coi turni
const TAIL_MS = 2 * 3600_000; // coda acquisti post-turno (stessa finestra della query di calibrazione)
const DEFAULTS = { days: 60, maxWins: 8, maxLosses: 8 };

// Cache keyata sul nome GREZZO encodato: la normalizzazione NON è iniettiva
// ('Anna Lisa'/'Annalisa' collassano) mentre la SQL matcha il member_name esatto —
// una chiave normalizzata servirebbe il film di un operatore a un altro (lezione
// identità-ambigua della duo-coverage). encodeURIComponent chiude anche il ':'.
const cacheKey = (op, days) => `film:${GAME_FILM_VERSION}:${encodeURIComponent(op)}:${days}`;
// literal SQL sicuro per il nome operatore (apostrofi/backslash/caratteri di controllo)
function sqlStr(s) {
  return String(s || "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\\/g, "")
    .replace(/'/g, "\\'");
}

// Chiave momento SENZA lo user_id grezzo: shift + alias HMAC del fan. È la SOLA
// chiave che esce nel payload (l'invariante "user_id mai nel payload" vale nel
// codice, non solo nei commenti — con creator_id accanto, l'id grezzo sarebbe
// joinabile a qualsiasi tabella fan-level e l'HMAC diventerebbe decorativo).
function safeKey(m) {
  // 12 hex (48 bit) di HMAC: id PERSISTENTE del registro giudizi — i 4 hex
  // dell'alias display colliderebbero tra fan dello stesso turno (16 bit).
  return `${m.shift_id}:${fanHmac(m.creator_id, m.user_id).slice(0, 12)}`;
}

// Meta per la LIBRERIA persistente (film-library): tutti i momenti classificati,
// non solo i top del payload. Porta user_id e finestra turno per il transcript
// on-demand — SOLO record server-side, mai in risposta (stripMomentMeta).
function toLibMeta(m) {
  return {
    key: safeKey(m),
    film_version: GAME_FILM_VERSION, // soglie con cui è stato classificato (bump → il momento resta leggibile per ciò che era)
    kind: m.kind,
    reason: m.reason || null,
    day: m.day,
    creator_id: m.creator_id,
    shift_id: m.shift_id,
    shift_start: Number(m.shift_start),
    shift_end: Number(m.shift_end),
    user_id: m.user_id,
    fan: fanAlias(m.creator_id, m.user_id),
    fan_msgs: Number(m.fan_msgs) || 0,
    op_msgs: Number(m.op_msgs) || 0,
    ppv_sent: Number(m.ppv_sent) || 0,
    max_ppv: m.max_ppv == null ? null : Number(m.max_ppv),
    bought: Number(m.bought) || 0,
    buys: Array.isArray(m.buys) ? m.buys.map((b) => ({ ts: Number(b.ts), amount: Number(b.amount) })) : [],
  };
}

// Feature per-(turno,fan) sui turni SINGOLI dell'operatore + acquisti in finestra.
function featuresSQL(operator, days) {
  const org = HOC_ORGANIZATION_ID;
  const D = DATA();
  const op = sqlStr(operator);
  return `
WITH all_shifts AS (
  SELECT creator_id, member_name, started_at, ended_at
  FROM \`${D}.onlyfans.cache_members\`
  WHERE started_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days + 1} DAY)
    AND organization_id = '${org}' AND member_name IS NOT NULL
    AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at > started_at
),
mine AS (
  SELECT shift_id, creator_id, started_at, ended_at
  FROM \`${D}.onlyfans.cache_members\`
  WHERE started_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
    AND organization_id = '${org}' AND member_name = '${op}'
    AND 'HOC - Chatter' IN UNNEST(role_names)
    AND effective_working_hours BETWEEN 1 AND 14
    AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at > started_at
),
single AS (
  SELECT m.* FROM mine m
  WHERE NOT EXISTS (
    SELECT 1 FROM all_shifts o
    WHERE o.creator_id = m.creator_id AND o.member_name != '${op}'
      AND o.started_at < m.ended_at AND o.ended_at > m.started_at)
),
conv AS (
  SELECT s.shift_id, s.creator_id,
    UNIX_MILLIS(s.started_at) AS shift_start, UNIX_MILLIS(s.ended_at) AS shift_end,
    CAST(DATE(s.started_at, 'Europe/Rome') AS STRING) AS day,
    c.user_id,
    COUNTIF(c.sender_id = c.creator_id) AS op_msgs,
    COUNTIF(c.sender_id = c.user_id) AS fan_msgs,
    COUNTIF(c.sender_id = c.creator_id AND c.price > 0) AS ppv_sent,
    ROUND(MAX(IF(c.sender_id = c.creator_id AND c.price > 0, CAST(c.price AS FLOAT64), NULL)), 0) AS max_ppv
  FROM single s
  JOIN \`${D}.onlyfans.chat\` c
    ON c.creator_id = s.creator_id AND c.created_at >= s.started_at AND c.created_at < s.ended_at
  WHERE c.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days + 1} DAY)
    AND c.organization_id = '${org}' AND c.user_id IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5, 6
),
tx AS (
  SELECT cv.shift_id, cv.user_id,
    ROUND(SUM(CAST(t.amount AS FLOAT64)), 0) AS bought,
    ARRAY_AGG(STRUCT(UNIX_MILLIS(t.created_at) AS ts, ROUND(CAST(t.amount AS FLOAT64), 0) AS amount) ORDER BY t.created_at) AS buys
  FROM conv cv
  JOIN \`${D}.onlyfans.attributed_transactions\` t
    ON t.creator_id = cv.creator_id AND t.user_id = cv.user_id
   AND t.organization_id = '${org}' AND t.type IN ('message', 'tip')
   AND UNIX_MILLIS(t.created_at) >= cv.shift_start
   AND UNIX_MILLIS(t.created_at) < cv.shift_end + ${TAIL_MS}
  WHERE t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days + 1} DAY)
  GROUP BY 1, 2
)
SELECT cv.*, IFNULL(tx.bought, 0) AS bought, tx.buys
FROM conv cv LEFT JOIN tx ON tx.shift_id = cv.shift_id AND tx.user_id = cv.user_id
WHERE cv.op_msgs > 0`;
}

// Transcript batched dei soli momenti selezionati (partition pruning sui bound
// globali; il filtro fine per finestra-turno avviene in JS, come nei tape).
function transcriptsSQL(moments, days) {
  const org = HOC_ORGANIZATION_ID;
  const D = DATA();
  const uids = [...new Set(moments.map((m) => m.user_id))];
  const cids = [...new Set(moments.map((m) => m.creator_id))];
  const tMin = Math.min(...moments.map((m) => m.shift_start));
  const tMax = Math.max(...moments.map((m) => m.shift_end));
  // NB: l'alias è \`ts\` e non \`at\` — AT è keyword riservata in BigQuery
  return `
SELECT creator_id, user_id, UNIX_MILLIS(created_at) AS ts,
  IF(sender_id = creator_id, 'op', 'fan') AS who,
  CAST(price AS FLOAT64) AS price, SUBSTR(text, 1, 400) AS text
FROM \`${D}.onlyfans.chat\`
WHERE creator_id IN (${cids.join(",")})
  AND organization_id = '${org}'
  AND user_id IN (${uids.join(",")})
  AND created_at BETWEEN TIMESTAMP_MILLIS(${tMin}) AND TIMESTAMP_MILLIS(${tMax})
  AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days + 1} DAY)
ORDER BY created_at`;
}

function toMoment(m, transcript, kind) {
  const buys = Array.isArray(m.buys) ? m.buys.map((b) => ({ ts: Number(b.ts), amount: Number(b.amount) })) : [];
  const lastBuy = buys.length ? buys[buys.length - 1].ts : null;
  const { messages, truncated } = trimTranscript(transcript, {
    cap: 60,
    anchorTs: kind === "win" ? lastBuy : null,
  });
  return {
    key: safeKey(m), // shift + alias HMAC: mai lo user_id grezzo nel payload
    kind,
    reason: m.reason || null,
    twin_key: m.twin_key || null, // già tradotta in safeKey dal chiamante
    day: m.day,
    creator_id: m.creator_id,
    fan: fanAlias(m.creator_id, m.user_id), // pseudonimo condiviso coi tape
    fan_msgs: Number(m.fan_msgs),
    op_msgs: Number(m.op_msgs),
    ppv_sent: Number(m.ppv_sent) || 0,
    max_ppv: m.max_ppv == null ? null : Number(m.max_ppv),
    bought: Number(m.bought) || 0,
    buys,
    // ladder dal transcript PIENO pre-trim: la card non può contraddire la sua
    // reason (un PPV all'inizio di una chat lunga sparirebbe dal transcript tagliato)
    ppv_ladder: ppvLadder(transcript),
    span_min: messages.length > 1 ? Math.round((messages[messages.length - 1].at - messages[0].at) / 60000) : 0,
    truncated,
    messages: messages.map((x) => ({ at: x.at, who: x.who, price: Number(x.price) || 0, text: x.text || "" })),
  };
}

/**
 * Il game film dell'operatore: vinte, perse e gemelle, con transcript.
 * SOLO superficie SEED (i transcript portano testo fan).
 */
export async function getOperatorGameFilm({ operator, days, maxWins, maxLosses, force = false } = {}) {
  const op = String(operator || "").trim();
  if (!op) throw new Error("Operatore mancante");
  const nDays = Math.min(Math.max(parseInt(days, 10) || DEFAULTS.days, 14), 120);
  const nWins = Math.min(Math.max(parseInt(maxWins, 10) || DEFAULTS.maxWins, 1), 20);
  const nLosses = Math.min(Math.max(parseInt(maxLosses, 10) || DEFAULTS.maxLosses, 1), 20);

  const usingDefaults = nDays === DEFAULTS.days && nWins === DEFAULTS.maxWins && nLosses === DEFAULTS.maxLosses;
  if (!force && usingDefaults) {
    const cached = await kv.get(cacheKey(op, nDays));
    if (cached) return { ...cached, cached: true };
  }

  const feat = await bqQuery(featuresSQL(op, nDays), { maxBytesBilled: CAP });
  const rows = feat.rows || [];

  const shiftIds = new Set(rows.map((r) => r.shift_id));
  const { wins, losses } = classifyMoments(rows);

  // LIBRERIA: accumula TUTTI i momenti classificati (id stabili, giudizi
  // preservati dal merge) — è ciò che rende raggiungibili anche i momenti
  // fuori dal top del payload. Best-effort: mai fatale per il film.
  try {
    await upsertFromFilm(op, [...wins, ...losses].map(toLibMeta));
  } catch {
    /* la libreria non deve mai rompere il film */
  }

  const selWins = wins.slice(0, nWins);
  const selLosses = losses.slice(0, nLosses);
  // le gemelle si accoppiano SOLO tra le vinte selezionate: twin_key deve
  // puntare a un momento presente nel payload.
  pairTwins(selLosses, selWins);
  // il core lavora su momentKey (raw, interno); nel payload esce SOLO la safeKey
  const safeByRaw = new Map(selWins.map((w) => [momentKey(w), safeKey(w)]));
  for (const l of selLosses) l.twin_key = l.twin_key ? safeByRaw.get(l.twin_key) || null : null;

  const selected = [...selWins, ...selLosses];
  let byConvo = new Map();
  if (selected.length) {
    const tr = await bqQuery(transcriptsSQL(selected, nDays), { maxBytesBilled: CAP });
    for (const m of tr.rows || []) {
      const k = `${m.creator_id}:${m.user_id}`;
      if (!byConvo.has(k)) byConvo.set(k, []);
      // ts (alias SQL) → at (contratto del core/UI)
      byConvo.get(k).push({ at: Number(m.ts), who: m.who, price: m.price, text: m.text });
    }
  }
  const transcriptFor = (m) =>
    (byConvo.get(`${m.creator_id}:${m.user_id}`) || []).filter(
      (x) => x.at >= m.shift_start && x.at < m.shift_end
    );

  const payload = {
    version: GAME_FILM_VERSION,
    operator: op,
    params: { days: nDays, max_wins: nWins, max_losses: nLosses },
    single_shifts: shiftIds.size,
    conversations: rows.length,
    totals: { wins: wins.length, losses: losses.length },
    wins: selWins.map((m) => toMoment(m, transcriptFor(m), "win")),
    losses: selLosses.map((m) => toMoment(m, transcriptFor(m), "loss")),
    generated_at: new Date().toISOString(),
  };
  if (usingDefaults) await kv.set(cacheKey(op, nDays), payload, { ex: CACHE_TTL });
  return { ...payload, cached: false };
}

/**
 * Transcript on-demand di UN momento della libreria (per i momenti fuori dal
 * top del payload: "come arrivo alle altre 22"). Una query sola, finestra del
 * turno di quel fan. Ritorna la card nello stesso formato di toMoment (mai
 * user_id in risposta). `meta` viene dalla libreria (record server-side).
 */
export async function getMomentCard(meta) {
  if (!meta || !meta.creator_id || !meta.user_id || !Number.isFinite(Number(meta.shift_start))) {
    throw new Error("Momento senza dati sufficienti per il transcript");
  }
  const org = HOC_ORGANIZATION_ID;
  const D = DATA();
  const sql = `
SELECT UNIX_MILLIS(created_at) AS ts,
  IF(sender_id = creator_id, 'op', 'fan') AS who,
  CAST(price AS FLOAT64) AS price, SUBSTR(text, 1, 400) AS text
FROM \`${D}.onlyfans.chat\`
WHERE creator_id = ${Number(meta.creator_id)}
  AND organization_id = '${org}'
  AND user_id = ${Number(meta.user_id)}
  AND created_at BETWEEN TIMESTAMP_MILLIS(${Number(meta.shift_start)}) AND TIMESTAMP_MILLIS(${Number(meta.shift_end)})
ORDER BY created_at`;
  const { rows } = await bqQuery(sql, { maxBytesBilled: CAP });
  const transcript = (rows || []).map((m) => ({ at: Number(m.ts), who: m.who, price: m.price, text: m.text }));
  return toMoment(
    {
      shift_id: meta.shift_id,
      creator_id: meta.creator_id,
      user_id: meta.user_id,
      day: meta.day,
      fan_msgs: meta.fan_msgs,
      op_msgs: meta.op_msgs,
      ppv_sent: meta.ppv_sent,
      max_ppv: meta.max_ppv,
      bought: meta.bought,
      buys: meta.buys,
      reason: meta.reason || null,
    },
    transcript,
    meta.kind
  );
}

export { bigQueryConfigured, GAME_FILM_VERSION };
