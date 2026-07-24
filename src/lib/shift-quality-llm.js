// Qualità turni · layer CONTENUTO (LLM) — etichetta le conversazioni di un
// creator×giorno con Claude Haiku: sentiment fan, tono/metodo chatter, obiezione,
// flag onestà, opportunità non chiuse, rischio churn. 1 conversazione = 1 chiamata,
// output strutturato via tool (il modello non può divagare).
//
// Architettura a JOB con tick client-driven (vincolo serverless ~60s):
//   startAnalysisJob  → lista conversazioni del giorno (cap) + stato in KV
//   tickAnalysisJob   → processa un batch (fetch testi da BQ + N chiamate Haiku
//                       in concorrenza), salva le etichette, avanza il cursore
//   readAnalysis      → aggregati giornata + per-turno + evidenze
//
// GUARDRAIL (non negoziabili):
//   - le etichette NON entrano in nessuno score/comp (uso coaching, come da policy)
//   - nei prompt e negli output NIENTE username/nome fan: il fan è "il fan",
//     l'evidenza porta solo user_id (pseudonimo interno) — minimizzazione
//   - turni duo: l'etichetta è del TURNO, mai attribuita a un singolo operatore

import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import { bqQuery } from "@/lib/bigquery-api";
import { loadShiftsForDay } from "@/lib/shift-quality";

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const MODEL = () => process.env.SHIFT_QUALITY_MODEL || "claude-haiku-4-5-20251001";
const MAX_CONVS = 400;        // cap per giornata (costo ~$1/creator-giorno a Haiku)
const BATCH = 16;             // conversazioni per tick
const CONCURRENCY = 6;        // chiamate Haiku in parallelo
const MAX_MSGS_PER_CONV = 70; // transcript cap (i più recenti)
const MAX_CHARS_PER_MSG = 280;
const JOB_TTL = 6 * 3600;
const ANALYSIS_TTL = 30 * 86400; // le giornate analizzate restano leggibili un mese

const jobKey = (cid, day) => `sq:job:${cid}:${day}`;
const analysisKey = (cid, day) => `sq:analysis:${cid}:${day}`;

const LABEL_TOOL = {
  name: "label_conversation",
  description: "Etichetta strutturata di una conversazione chatter↔fan",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      sentiment_fan: { type: "string", enum: ["positivo", "neutro", "frustrato"], description: "stato del fan a fine conversazione" },
      tono_chatter: { type: "string", enum: ["warm", "neutro", "pushy", "ostile"], description: "metodo prevalente del lato creator" },
      obiezione: { type: "string", enum: ["prezzo", "interesse", "tempo", "fiducia", "nessuna"], description: "motivo principale per cui il fan non compra; 'nessuna' se ha comprato o nessun ostacolo" },
      flag_onesta: { type: "boolean", description: "true se il lato creator fa promesse false, prezzi ingannevoli, pressione manipolatoria o scam percepito" },
      opportunita_non_chiusa: { type: "boolean", description: "true se fan positivo + tono buono ma nessuna proposta/acquisto" },
      rischio_churn: { type: "boolean", description: "true se fan frustrato o trattato male: probabile abbandono" },
      sintesi: { type: "string", description: "UNA frase in italiano, professionale, senza citare nomi; descrive dinamica e esito" },
    },
    required: ["sentiment_fan", "tono_chatter", "obiezione", "flag_onesta", "opportunita_non_chiusa", "rischio_churn", "sintesi"],
  },
};

const SYSTEM = `Sei un analista QA di un'agenzia che gestisce chat 1:1 con i fan. Ricevi il transcript di UNA conversazione (lato CHATTER = chi scrive per l'account, lato FAN) in italiano, inglese o spagnolo, con eventi PPV marcati.
Etichetta la conversazione chiamando SEMPRE lo strumento label_conversation. Criteri:
- sentiment_fan: lo stato del FAN alla fine (non all'inizio).
- tono_chatter: warm = costruisce rapport; neutro = small talk; pushy = pressione/colpevolizzazione ripetuta per vendere; ostile = insulti/disprezzo.
- obiezione: il motivo PRINCIPALE per cui non compra in questa conversazione. "nessuna" se ha comprato o non c'è ostacolo.
- flag_onesta: SOLO per segnali concreti (promesse non mantenute, prezzi che cambiano in modo ingannevole, "scade tra poco" falso, contenuto spacciato per ciò che non è). Non flaggare la normale vendita insistente: quella è "pushy".
- sintesi: una frase sobria e utile per il coaching. Mai nomi propri: di' "il fan" e "il chatter".
Giudica ciò che LEGGI, senza inventare. Contenuto adulto: è il contesto normale del lavoro, valuta il metodo di vendita, non il tema.`;

/** Avvia (o riprende) il job: costruisce la lista conversazioni del giorno. */
export async function startAnalysisJob(creatorId, day, { force = false } = {}) {
  const cid = parseInt(creatorId, 10);
  if (!Number.isInteger(cid)) throw new Error("creator_id non valido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("day non valido");

  const existing = await kv.get(jobKey(cid, day));
  if (existing && !force && existing.status !== "error") return existing;

  const shifts = await loadShiftsForDay([cid], day);
  if (!shifts.length) {
    const job = { status: "empty", convs: [], done: 0, total: 0, day, creator_id: String(cid) };
    await kv.set(jobKey(cid, day), job, { ex: JOB_TTL });
    return job;
  }
  const minS = Math.floor(Math.min(...shifts.map((s) => s.start)) / 1000);
  const maxE = Math.ceil(Math.max(...shifts.map((s) => s.end)) / 1000);

  // Conversazioni con dialogo reale: >=2 msg fan e >=2 msg lato-creator personali.
  const { rows } = await bqQuery(`
WITH base AS (
  SELECT id, user_id, sender_id, created_at, TIMESTAMP_TRUNC(created_at, SECOND) AS sec_bucket,
    (sender_id = user_id) AS is_fan
  FROM \`${DATA()}.hoc.ws_chat\`
  WHERE creator_id = ${cid}
    AND created_at >= TIMESTAMP_SECONDS(${minS}) AND created_at < TIMESTAMP_SECONDS(${maxE})
    AND user_id IS NOT NULL AND sender_id IS NOT NULL AND creator_id <> user_id
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY commit_timestamp DESC) = 1
),
bucketed AS (
  SELECT user_id, created_at, is_fan, sender_id, sec_bucket,
    ROW_NUMBER() OVER (PARTITION BY sender_id, sec_bucket, user_id ORDER BY created_at, id) AS rn
  FROM base
),
flagged AS (
  SELECT user_id, created_at, is_fan,
    SUM(IF(rn = 1, 1, 0)) OVER (PARTITION BY sender_id, sec_bucket) AS recipients
  FROM bucketed
)
SELECT user_id,
  COUNTIF(is_fan) AS fan_msgs,
  COUNTIF(NOT is_fan AND recipients < 5) AS op_msgs,
  UNIX_SECONDS(MIN(created_at)) AS first_t,
  UNIX_SECONDS(MAX(created_at)) AS last_t
FROM flagged
GROUP BY user_id
HAVING fan_msgs >= 2 AND op_msgs >= 2
ORDER BY fan_msgs + op_msgs DESC
LIMIT ${MAX_CONVS}`);

  const convs = rows.map((r) => ({
    uid: String(r.user_id),
    n: Number(r.fan_msgs) + Number(r.op_msgs),
    first_t: Number(r.first_t),
    last_t: Number(r.last_t),
  }));
  const job = {
    status: convs.length ? "running" : "empty",
    day, creator_id: String(cid),
    total: convs.length, done: 0,
    convs, labels: {},
    started_at: new Date().toISOString(),
  };
  await kv.set(jobKey(cid, day), job, { ex: JOB_TTL });
  await kv.del(analysisKey(cid, day)); // una nuova analisi invalida la precedente
  return job;
}

/** Processa il prossimo batch. Ritorna lo stato aggiornato (status: running|done). */
export async function tickAnalysisJob(creatorId, day) {
  const cid = parseInt(creatorId, 10);
  const job = await kv.get(jobKey(cid, day));
  if (!job || job.status === "empty") return job || { status: "missing" };
  if (job.status === "done") return job;

  const pending = job.convs.filter((c) => !job.labels[c.uid]).slice(0, BATCH);
  if (!pending.length) {
    job.status = "done";
    await finalizeAnalysis(cid, day, job);
    await kv.set(jobKey(cid, day), { ...job, convs: undefined, labels: undefined }, { ex: JOB_TTL });
    return job;
  }

  // Testi del batch in UNA query (solo i campi necessari; il fan resta user_id).
  const uids = pending.map((c) => c.uid).join(",");
  const minT = Math.min(...pending.map((c) => c.first_t));
  const maxT = Math.max(...pending.map((c) => c.last_t)) + 1;
  const { rows } = await bqQuery(`
SELECT user_id, UNIX_SECONDS(created_at) AS t, (sender_id = user_id) AS is_fan,
  SUBSTR(JSON_VALUE(body, '$.text'), 1, ${MAX_CHARS_PER_MSG}) AS text,
  SAFE_CAST(JSON_VALUE(body, '$.price') AS FLOAT64) AS price,
  JSON_VALUE(body, '$.isOpened') = 'true' AS opened,
  JSON_VALUE(body, '$.isTip') = 'true' AS tip
FROM \`${DATA()}.hoc.ws_chat\`
WHERE creator_id = ${cid} AND user_id IN (${uids})
  AND created_at >= TIMESTAMP_SECONDS(${minT}) AND created_at < TIMESTAMP_SECONDS(${maxT})
QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY commit_timestamp DESC) = 1
ORDER BY user_id, t`);

  const byUid = new Map();
  for (const r of rows) {
    const uid = String(r.user_id);
    if (!byUid.has(uid)) byUid.set(uid, []);
    byUid.get(uid).push(r);
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const queue = [...pending];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const conv = queue.shift();
      const msgs = (byUid.get(conv.uid) || []).slice(-MAX_MSGS_PER_CONV);
      if (!msgs.length) { job.labels[conv.uid] = { skipped: true }; continue; }
      const transcript = msgs.map((m) => {
        const side = m.is_fan ? "FAN" : "CHATTER";
        const evt = m.tip ? " [TIP]" : Number(m.price) > 0 ? ` [PPV $${Number(m.price)}${m.opened ? " SBLOCCATO" : " non aperto"}]` : "";
        const text = (m.text || "").replace(/\s+/g, " ").trim() || "(media senza testo)";
        return `${side}${evt}: ${text}`;
      }).join("\n");
      try {
        const res = await anthropic.messages.create({
          model: MODEL(),
          max_tokens: 400,
          system: SYSTEM,
          tools: [LABEL_TOOL],
          tool_choice: { type: "tool", name: "label_conversation" },
          messages: [{ role: "user", content: `Conversazione (fan id interno ${conv.uid}, ${msgs.length} messaggi):\n\n${transcript}` }],
        });
        const call = res.content.find((b) => b.type === "tool_use");
        job.labels[conv.uid] = call ? { ...call.input, first_t: conv.first_t, last_t: conv.last_t, n: conv.n } : { error: "no-tool-call" };
      } catch (e) {
        job.labels[conv.uid] = { error: String(e?.message || e).slice(0, 200) };
      }
    }
  });
  await Promise.all(workers);

  job.done = Object.keys(job.labels).length;
  if (job.done >= job.total) {
    job.status = "done";
    await finalizeAnalysis(cid, day, job);
    await kv.set(jobKey(cid, day), { ...job, convs: undefined, labels: undefined }, { ex: JOB_TTL });
  } else {
    await kv.set(jobKey(cid, day), job, { ex: JOB_TTL });
  }
  return { status: job.status, done: job.done, total: job.total };
}

function tally(labels, field, values) {
  const out = Object.fromEntries(values.map((v) => [v, 0]));
  for (const l of labels) if (l[field] != null && out[l[field]] != null) out[l[field]]++;
  return out;
}

/** Aggrega le etichette in: totali giornata, per-turno (overlap finestra), evidenze. */
async function finalizeAnalysis(cid, day, job) {
  const labels = Object.entries(job.labels)
    .filter(([, l]) => !l.error && !l.skipped)
    .map(([uid, l]) => ({ uid, ...l }));
  const shifts = await loadShiftsForDay([cid], day);

  const perShift = shifts.map((s) => {
    const sS = s.start / 1000, sE = s.end / 1000;
    const inShift = labels.filter((l) => l.first_t < sE && l.last_t >= sS); // overlap
    return {
      start: new Date(s.start).toISOString(),
      end: new Date(s.end).toISOString(),
      operators: s.operators,
      attribution: s.operators.length > 1 || s.k > 1 ? "duo" : "singolo",
      convs: inShift.length,
      sentiment: tally(inShift, "sentiment_fan", ["positivo", "neutro", "frustrato"]),
      tono: tally(inShift, "tono_chatter", ["warm", "neutro", "pushy", "ostile"]),
      obiezioni: tally(inShift, "obiezione", ["prezzo", "interesse", "tempo", "fiducia", "nessuna"]),
      flag_onesta: inShift.filter((l) => l.flag_onesta).length,
    };
  });

  const evidence = (pred, cap = 12) =>
    labels.filter(pred).slice(0, cap).map((l) => ({
      uid: l.uid, sintesi: l.sintesi,
      sentiment: l.sentiment_fan, tono: l.tono_chatter, obiezione: l.obiezione,
    }));

  const analysis = {
    day, creator_id: String(cid),
    model: MODEL(),
    convs_labeled: labels.length,
    convs_failed: Object.values(job.labels).filter((l) => l.error).length,
    sentiment: tally(labels, "sentiment_fan", ["positivo", "neutro", "frustrato"]),
    tono: tally(labels, "tono_chatter", ["warm", "neutro", "pushy", "ostile"]),
    obiezioni: tally(labels, "obiezione", ["prezzo", "interesse", "tempo", "fiducia", "nessuna"]),
    flag_onesta: labels.filter((l) => l.flag_onesta).length,
    per_shift: perShift,
    evidenze: {
      onesta: evidence((l) => l.flag_onesta),
      opportunita: evidence((l) => l.opportunita_non_chiusa),
      churn: evidence((l) => l.rischio_churn),
    },
    // Mappa per-fan (uid → ultima etichetta del giorno): alimenta la scheda-fan
    // di /me/turno ("dov'era rimasta la conversazione"). Solo campi minimi,
    // niente nomi: il fan resta user_id anche qui.
    fans: Object.fromEntries(
      labels.map((l) => [
        l.uid,
        {
          obiezione: l.obiezione,
          sentiment: l.sentiment_fan,
          tono: l.tono_chatter,
          flag_onesta: l.flag_onesta || undefined,
          opportunita_non_chiusa: l.opportunita_non_chiusa || undefined,
          rischio_churn: l.rischio_churn || undefined,
          sintesi: l.sintesi,
          last_t: l.last_t,
        },
      ])
    ),
    generated_at: new Date().toISOString(),
  };
  await kv.set(analysisKey(cid, day), analysis, { ex: ANALYSIS_TTL });
  return analysis;
}

export async function readAnalysis(creatorId, day) {
  const cid = parseInt(creatorId, 10);
  const [analysis, job] = await Promise.all([kv.get(analysisKey(cid, day)), kv.get(jobKey(cid, day))]);
  return { analysis: analysis || null, job: job ? { status: job.status, done: job.done, total: job.total } : null };
}
