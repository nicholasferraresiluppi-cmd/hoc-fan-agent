// Academy Signals — "quali comportamenti pagano DA NOI" (Tier 2 · Gong Labs interno).
//
// Ricalcola dal warehouse la correlazione tra comportamenti misurabili degli
// operatori e il revenue/ora, sui turni a OPERATORE SINGOLO (attribuzione pulita,
// stesso principio di shift-quality.js). È il ponte tra i dati reali e il coaching:
// non importa le regole di altri settori, le CALIBRA sui nostri numeri.
//
// GOVERNANCE / ONESTÀ:
//   - segnale within-creator (correlazione DENTRO ogni creator, poi aggregata):
//     rimuove il confondente "creator ricco". Sign-consistency esplicita (quanti
//     creator concordano) per non spacciare un segnale trascinato da pochi.
//   - caveat dichiarati per comportamento (es. prezzo PPV ha reverse-causation
//     parziale: un whale presente alza sia il prezzo sia il revenue).
//   - NON tocca lo score/comp: è materiale di coaching (policy dati-fan).
//   - metodologia versionata (SIGNALS_VERSION + params nel payload) per trasparenza.
//
// Fonti: `cache_members` (finestre turno + outcome) × `onlyfans.chat` (comportamento
// testuale op-side). Vedi docs/ e memory academy-tier2-signals-evidence.

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";

export const SIGNALS_VERSION = "s2-2026-07"; // bump se cambia la metodologia
const CACHE_KEY = `academy:signals:${SIGNALS_VERSION}`; // scoped alla versione: no stale al bump
const CACHE_TTL = 25 * 3600; // 25h: il cron giornaliero (dispatch) riscalda prima che scada → la GET legge cache, non calcola inline

const DEFAULTS = { days: 60, minShiftMsgs: 20, minCreatorShifts: 30 };
const MIN_PAIRS = 8; // coppie (comportamento, rev/ora) non-null minime per creare la CORR di un creator

// Catalogo dei comportamenti misurati. `dir` = direzione attesa/consigliata.
// `caveat` accompagna sempre i segnali con rischio interpretativo.
const BEHAVIORS = [
  {
    key: "ppv_avg_price",
    label: "Prezzo medio dei PPV",
    measure: "Media del prezzo dei contenuti a pagamento inviati nel turno.",
    coaching: "Non svendere: alzare l'asticella del prezzo, quando il fan è caldo, paga.",
    caveat: "Correlazione in parte gonfiata dalla reverse-causation: un whale presente alza sia il prezzo sia il revenue. Da leggere insieme alla cadenza.",
  },
  {
    key: "ppv_cadence",
    label: "Cadenza dei PPV (invii/ora)",
    measure: "Quanti contenuti a pagamento l'operatore propone per ora di turno.",
    coaching: "Proporre con continuità: chi presenta più occasioni di acquisto, a parità di creator, vende di più.",
    caveat: null,
  },
  {
    key: "msg_cadence",
    label: "Cadenza dei messaggi (msg/ora)",
    measure: "Ritmo di messaggi dell'operatore per ora di turno.",
    coaching: "Tenere viva la conversazione: il presidio attivo batte le pause lunghe.",
    caveat: null,
  },
  {
    key: "question_rate",
    label: "Tasso di domande",
    measure: "Quota di messaggi dell'operatore che contengono una domanda.",
    coaching: "Nel chatting si CONDUCE, non si intervista: troppe domande = passività. È l'opposto del B2B — segnale calibrato sui nostri dati.",
    caveat: null,
  },
  {
    key: "talk_ratio",
    label: "Talk ratio (parole op / totale)",
    measure: "Quota di parole scritte dall'operatore sul totale della conversazione.",
    coaching: null,
    caveat: null,
  },
  {
    key: "words_per_msg",
    label: "Lunghezza media dei messaggi",
    measure: "Parole per messaggio dell'operatore.",
    coaching: null,
    caveat: null,
  },
];

function signalsSQL(days, minShiftMsgs, minCreatorShifts) {
  const org = HOC_ORGANIZATION_ID;
  const D = DATA();
  // Floor coppie inline nella query: se un creator ha < MIN_PAIRS shift con il
  // comportamento definito (es. pochi turni con PPV), la sua CORR per quel
  // comportamento è NULL invece di saturare a ±1 su 2-3 punti.
  const corr = (col) =>
    `IF(COUNTIF(${col} IS NOT NULL AND rev_h IS NOT NULL) >= ${MIN_PAIRS}, CORR(${col}, rev_h), NULL)`;
  return `
-- WIDE: ogni turno sul creator (qualunque ruolo/ore) per il test di sovrapposizione.
-- Serve a NON classificare "singolo" un turno chatter che si sovrappone a un
-- turno di un'altra persona escluso dal filtro ore/ruolo di chatter_shifts.
WITH all_shifts AS (
  SELECT creator_id, member_name, started_at, ended_at
  FROM \`${D}.onlyfans.cache_members\`
  WHERE started_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days + 1} DAY)
    AND organization_id = '${org}'
    AND member_name IS NOT NULL
    AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at > started_at
),
chatter_shifts AS (
  SELECT shift_id, member_name, creator_id, started_at, ended_at,
         effective_working_hours AS hours, amount AS revenue
  FROM \`${D}.onlyfans.cache_members\`
  WHERE started_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
    AND organization_id = '${org}'
    AND 'HOC - Chatter' IN UNNEST(role_names)
    AND effective_working_hours BETWEEN 1 AND 14
    AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at > started_at
),
single AS (
  SELECT s.* FROM chatter_shifts s
  WHERE NOT EXISTS (
    SELECT 1 FROM all_shifts o
    WHERE o.creator_id = s.creator_id
      AND o.member_name != s.member_name         -- un'altra PERSONA (non un altro turno mio)
      AND o.started_at < s.ended_at AND o.ended_at > s.started_at)
),
-- feat: UNA riga per SHIFT (group by shift_id). Raggruppare per (creator,ore,revenue)
-- fonderebbe turni distinti con stessi valori (es. più turni a 8h e revenue 0),
-- sommando i messaggi e gonfiando la cadenza.
feat AS (
  SELECT s.shift_id,
    ANY_VALUE(s.creator_id) AS creator_id,
    ANY_VALUE(s.hours) AS hours,
    ANY_VALUE(s.revenue) AS revenue,
    COUNTIF(c.sender_id = c.creator_id) AS op_msgs,
    SUM(IF(c.sender_id = c.creator_id, c.words, 0)) AS op_words,
    SUM(IF(c.sender_id = c.user_id, c.words, 0)) AS fan_words,
    COUNTIF(c.sender_id = c.creator_id AND c.text LIKE '%?%') AS op_q,
    COUNTIF(c.sender_id = c.creator_id AND c.price > 0) AS ppv,
    AVG(IF(c.sender_id = c.creator_id AND c.price > 0, CAST(c.price AS FLOAT64), NULL)) AS ppv_price
  FROM single s
  JOIN \`${D}.onlyfans.chat\` c
    ON c.creator_id = s.creator_id AND c.created_at >= s.started_at AND c.created_at < s.ended_at
  WHERE c.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days + 1} DAY)
    AND c.organization_id = '${org}'
  GROUP BY s.shift_id
),
m AS (
  SELECT creator_id, revenue / hours AS rev_h,
    op_msgs / hours AS msg_cadence,
    SAFE_DIVIDE(op_q, op_msgs) AS question_rate,
    ppv / hours AS ppv_cadence,
    ppv_price AS ppv_avg_price,
    SAFE_DIVIDE(op_words, op_words + fan_words) AS talk_ratio,
    SAFE_DIVIDE(op_words, op_msgs) AS words_per_msg
  FROM feat WHERE hours > 0 AND op_msgs >= ${minShiftMsgs}
)
SELECT creator_id, COUNT(*) AS n,
  ${corr("msg_cadence")}   AS msg_cadence,
  ${corr("question_rate")} AS question_rate,
  ${corr("ppv_cadence")}   AS ppv_cadence,
  ${corr("ppv_avg_price")} AS ppv_avg_price,
  ${corr("talk_ratio")}    AS talk_ratio,
  ${corr("words_per_msg")} AS words_per_msg
FROM m
GROUP BY creator_id
HAVING n >= ${minCreatorShifts}`;
}

function strengthLabel(absCorr) {
  if (absCorr >= 0.3) return "forte";
  if (absCorr >= 0.15) return "moderato";
  if (absCorr >= 0.07) return "debole";
  return "nessun segnale";
}

// Aggrega le correlazioni per-creator in un verdetto per comportamento.
function aggregate(rows) {
  const totalShifts = rows.reduce((a, r) => a + Number(r.n || 0), 0);
  const signals = BEHAVIORS.map((b) => {
    const vals = rows.map((r) => r[b.key]).filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
    const creators = vals.length;
    if (!creators) {
      return { ...b, creators: 0, mean_corr: null, positive: 0, consistency: null, direction: null, strength: "n/d" };
    }
    const mean = vals.reduce((a, v) => a + v, 0) / creators;
    // consistenza = quanti creator concordano col SEGNO del segnale medio, con
    // segni STRETTI e simmetrici (le CORR esattamente 0 non contano per nessuno).
    const positive = vals.filter((v) => v > 0).length;
    const negative = vals.filter((v) => v < 0).length;
    const agree = mean > 0 ? positive : mean < 0 ? negative : 0;
    return {
      key: b.key,
      label: b.label,
      measure: b.measure,
      coaching: b.coaching,
      caveat: b.caveat,
      creators,
      mean_corr: +mean.toFixed(3),
      agree,
      consistency: +(agree / creators).toFixed(2),
      direction: mean > 0 ? "up" : "down", // up = più è meglio, down = meno è meglio
      strength: strengthLabel(Math.abs(mean)),
    };
  });
  // ordina per forza del segnale (i "nessun segnale" in fondo)
  signals.sort((a, b) => Math.abs(b.mean_corr ?? 0) - Math.abs(a.mean_corr ?? 0));
  return { signals, creators_analyzed: rows.length, shifts_analyzed: totalShifts };
}

export async function getAcademySignals({ force = false, days, minShiftMsgs, minCreatorShifts } = {}) {
  const params = {
    days: clampInt(days, DEFAULTS.days, 14, 120),
    minShiftMsgs: clampInt(minShiftMsgs, DEFAULTS.minShiftMsgs, 1, 200),
    minCreatorShifts: clampInt(minCreatorShifts, DEFAULTS.minCreatorShifts, 5, 200),
  };
  const usingDefaults =
    params.days === DEFAULTS.days &&
    params.minShiftMsgs === DEFAULTS.minShiftMsgs &&
    params.minCreatorShifts === DEFAULTS.minCreatorShifts;

  // la cache vale solo per i parametri di default (il caso comune)
  if (!force && usingDefaults) {
    const cached = await kv.get(CACHE_KEY);
    if (cached) return { ...cached, cached: true };
  }

  const { rows, totalBytesProcessed } = await bqQuery(
    signalsSQL(params.days, params.minShiftMsgs, params.minCreatorShifts),
    { maxBytesBilled: 8 * 1024 * 1024 * 1024 }
  );
  const agg = aggregate(rows);
  const payload = {
    version: SIGNALS_VERSION,
    params,
    ...agg,
    bytes_processed: totalBytesProcessed,
    generated_at: new Date().toISOString(),
  };
  if (usingDefaults) await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL });
  return { ...payload, cached: false };
}

function clampInt(v, def, lo, hi) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, lo), hi);
}

export { bigQueryConfigured };
