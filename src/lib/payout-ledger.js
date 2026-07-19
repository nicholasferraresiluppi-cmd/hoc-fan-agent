/**
 * Payout Ledger — sync transazioni fan-level Infloww per periodo, stato in KV.
 *
 * È la fonte dell'albero payout (trasparenza comp v2): per ogni creator×mese
 * salva le transazioni RAW (con transactionId stabile) + i refund, così che
 * il drill-down take CP → transazione fan sia riproducibile nel tempo — la
 * dispute policy (CAREER_LADDER §8.2) richiede evidenza congelata, non un
 * ricalcolo live che cambia mentre arrivano i chargeback.
 *
 * Stesso pattern di infloww-sync-job (job in KV + step con budget tempo +
 * retry round), ma per PERIODO MENSILE e con record grezzi, non aggregati.
 *
 * Schema record VERIFICATO live (probe 19 lug 2026, più ricco dei commenti
 * storici del client):
 *   transazione: { id, transactionId (uuid 32-hex), fanId, fanName,
 *                  createdTime (ms string), type, tipSource, status
 *                  ('loading'|'complete'|...), amount/fee/net (CENT string),
 *                  currency }
 *   refund:      { id, transactionId (= transazione originale → join ESATTO),
 *                  fanId, paymentTime, refundTime (ms string),
 *                  paymentStatus ('undo'), paymentAmount (CENT), transactionType }
 *   NB: nessun campo employee/chatter → l'attribuzione all'operatore non
 *   esiste nel payload, la fa il match engine (payout-match) via finestra
 *   shift CP + quadratura importi. Mai presentarla come autoritativa.
 *
 * KV:
 *   infloww:txns:job                        stato job corrente
 *   infloww:txns:{period}:{creatorId}       meta { name, count, chunks, gross_c, fee_c, net_c, truncated, refunds, synced_at }
 *   infloww:txns:{period}:{creatorId}:c{i}  chunk (array di record slim, max CHUNK_SIZE)
 *   infloww:refunds:{period}:{creatorId}    array refund slim
 *   infloww:txns:meta:{period}              { synced_at, creators_total, synced, failed, totals }
 *   infloww:txns:periods                    array di periodi sincronizzati
 *   (roster condiviso: infloww:creators — stesso del sync agency)
 */
import { kv } from "@vercel/kv";
import { inflowwPaged } from "./infloww-api";

const JOB_KEY = "infloww:txns:job";
const ROSTER_KEY = "infloww:creators";
const PERIODS_KEY = "infloww:txns:periods";
const metaKey = (period) => `infloww:txns:meta:${period}`;
const creatorKey = (period, id) => `infloww:txns:${period}:${id}`;
// I chunk portano un marcatore di GENERAZIONE: la meta (scritta per ultima) è
// l'unico commit point — un kill a metà scrittura lascia chunk nuovi orfani
// (ripuliti dal TTL) ma la meta continua a puntare alla generazione vecchia
// completa. Mai stati misti serviti come "evidenza congelata".
const chunkKey = (period, id, i, gen) => gen
  ? `infloww:txns:${period}:${id}:${gen}:c${i}`
  : `infloww:txns:${period}:${id}:c${i}`; // legacy pre-generazioni
const refundsKey = (period, id) => `infloww:refunds:${period}:${id}`;

const TTL_JOB = 6 * 3600;
// Evidenza per dispute: le finestre gate arrivano a 6 mesi e l'appello ha SLA
// proprio → 400 giorni copre "mese contestato + un anno di coda".
const TTL_LEDGER = 400 * 24 * 3600;
// Il roster infloww:creators è CONDIVISO con infloww-sync-job (che lo scrive
// con TTL 100gg): stessa semantica di scadenza da entrambi i proprietari.
const TTL_ROSTER = 100 * 24 * 3600;
const STEP_BUDGET_MS = 40000;
const CONC = 2; // transazioni = molte pagine/creator: concorrenza bassa per stare nei 20 QPS
const CHUNK_SIZE = 1000;
const MAX_PAGES = 150; // 15k tx/creator/mese: oltre → truncated esplicito
// Deadline per singolo creator: il budget step (40s) gata solo l'INIZIO di un
// batch; senza cap interno un creator monstre porta la function oltre i 60s di
// Vercel e il job non avanza mai (il cursore si salva a fine batch). Con la
// deadline il creator degrada nel percorso truncated già progettato.
const CREATOR_DEADLINE_MS = 25000;

const cents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

// ── Confini mese in ORA DI ROMA (coerente con reconcile/sync-job) ──────────
const romeDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
export const romeDay = (ms) => { const n = Number(ms); return Number.isFinite(n) ? romeDayFmt.format(new Date(n)) : "?"; };
export const romePeriod = (ms) => romeDay(ms).slice(0, 7);

function romeMidnight(dayStr) {
  let d = new Date(`${dayStr}T00:00:00+02:00`);
  if (romeDay(d.getTime()) !== dayStr) d = new Date(`${dayStr}T00:00:00+01:00`);
  return d;
}

export function periodBounds(periodId) {
  const m = String(periodId || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error(`period_id invalido (atteso YYYY-MM): ${periodId}`);
  const y = Number(m[1]), mo = Number(m[2]);
  const start = romeMidnight(`${periodId}-01`);
  const nextId = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  const end = new Date(romeMidnight(`${nextId}-01`).getTime() - 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

// ── Job ────────────────────────────────────────────────────────────────────
export async function getLedgerJob() { return (await kv.get(JOB_KEY)) || null; }

export async function resetLedgerJob() { await kv.del(JOB_KEY); }

export async function startLedgerJob(periodId) {
  periodBounds(periodId); // valida il formato
  const { items } = await inflowwPaged("/v1/creators", { query: { platformCode: "OnlyFans" }, limit: 100, maxPages: 5 });
  const creators = items.map((c) => ({ id: c.id, name: c.name || c.userName || String(c.id), userName: c.userName || "" }));
  if (creators.length === 0) {
    // Non sovrascrivere il roster condiviso né avviare un job che finalizzerebbe
    // un periodo vuoto: quasi certamente un errore transitorio dell'API.
    throw new Error("Roster Infloww vuoto da /v1/creators — sync annullato, riprova");
  }
  await kv.set(ROSTER_KEY, creators, { ex: TTL_ROSTER });
  const job = {
    period_id: periodId, creators, total_creators: creators.length,
    cursor: 0, synced: 0, failed: [], retry_round: 0,
    status: "running", started_at: Date.now(), updated_at: Date.now(), last_step: "start",
  };
  await kv.set(JOB_KEY, job, { ex: TTL_JOB });
  return job;
}

function slimTx(t) {
  const rec = {
    tid: t.transactionId || null,
    fid: t.fanId || null,
    fn: t.fanName || null,
    t: Number(t.createdTime) || 0,
    ty: t.type || null,
    st: t.status || null,
    g: cents(t.amount),
    f: cents(t.fee),
    n: cents(t.net),
  };
  if (t.currency && t.currency !== "USD") rec.cur = t.currency;
  if (t.tipSource) rec.tip = t.tipSource;
  return rec;
}

function slimRefund(r) {
  return {
    tid: r.transactionId || null,
    fid: r.fanId || null,
    pt: Number(r.paymentTime) || 0,
    rt: Number(r.refundTime) || 0,
    ps: r.paymentStatus || null,
    amt: cents(r.paymentAmount),
    tt: r.transactionType || null,
  };
}

async function syncCreatorPeriod(creator, periodId, startIso, endIso) {
  const deadline = Date.now() + CREATOR_DEADLINE_MS;
  const [txRes, rfRes] = await Promise.all([
    inflowwPaged("/v1/transactions", {
      query: { creatorId: creator.id, startTime: startIso, endTime: endIso, platformCode: "OnlyFans" },
      limit: 100, maxPages: MAX_PAGES, timeoutMs: 15000, deadline,
    }),
    inflowwPaged("/v1/refunds", {
      query: { creatorId: creator.id, startTime: startIso, endTime: endIso, platformCode: "OnlyFans" },
      limit: 100, maxPages: 10, timeoutMs: 15000, deadline,
    }),
  ]);

  // Dedup per transactionId (paginazione a cursore su dati vivi può ripetere
  // un record al confine di pagina) — l'ordine resta quello dell'API.
  const seen = new Set();
  const txns = [];
  for (const t of txRes.items) {
    const s = slimTx(t);
    const k = s.tid || `${s.fid}:${s.t}:${s.g}`;
    if (seen.has(k)) continue;
    seen.add(k);
    txns.push(s);
  }
  txns.sort((a, b) => a.t - b.t);
  // Dedup refund, stesso rischio al confine pagina. Chiave = id proprio del
  // record (il tid è quello della VENDITA: due refund parziali legittimi lo
  // condividono), fallback composito.
  const seenRf = new Set();
  const refunds = [];
  for (const r of rfRes.items) {
    const k = r.id || `${r.transactionId}:${r.refundTime}:${r.paymentAmount}`;
    if (seenRf.has(k)) continue;
    seenRf.add(k);
    refunds.push(slimRefund(r));
  }

  let grossC = 0, feeC = 0, netC = 0;
  for (const t of txns) { grossC += t.g; feeC += t.f; netC += t.n; }

  // Full refresh con GENERAZIONE: chunk su chiavi nuove, meta per ultima
  // (commit point), poi cleanup best-effort della generazione precedente —
  // un kill a metà non produce mai stati misti leggibili.
  const prevMeta = await kv.get(creatorKey(periodId, creator.id));
  const gen = Date.now().toString(36);
  const chunks = Math.ceil(txns.length / CHUNK_SIZE);
  for (let i = 0; i < chunks; i++) {
    await kv.set(chunkKey(periodId, creator.id, i, gen), txns.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), { ex: TTL_LEDGER });
  }
  await kv.set(refundsKey(periodId, creator.id), refunds, { ex: TTL_LEDGER });
  await kv.set(creatorKey(periodId, creator.id), {
    name: creator.name, count: txns.length, chunks, gen,
    gross_c: grossC, fee_c: feeC, net_c: netC,
    truncated: txRes.truncated || undefined,
    refunds: refunds.length,
    refunds_truncated: rfRes.truncated || undefined,
    synced_at: Date.now(),
  }, { ex: TTL_LEDGER });
  if (prevMeta?.chunks > 0) {
    for (let i = 0; i < prevMeta.chunks; i++) {
      await kv.del(chunkKey(periodId, creator.id, i, prevMeta.gen || null)).catch(() => {});
    }
  }
  return txns.length;
}

export async function stepLedgerJob() {
  const job = await getLedgerJob();
  if (!job || job.status !== "running") return { has_more: false, job };
  const periodId = job.period_id;
  const { startIso, endIso } = periodBounds(periodId);
  // Mese corrente: finestra fino ad adesso (i giorni futuri non esistono).
  const endEff = new Date(endIso).getTime() > Date.now() ? new Date().toISOString() : endIso;

  const start = Date.now();
  try {
    while (job.cursor < job.creators.length && (Date.now() - start) < STEP_BUDGET_MS) {
      const batch = job.creators.slice(job.cursor, job.cursor + CONC);
      const res = await Promise.all(batch.map((c) =>
        syncCreatorPeriod(c, periodId, startIso, endEff).then(() => null).catch(() => c)
      ));
      const failed = res.filter(Boolean);
      if (failed.length) {
        const seen = new Set((job.failed || []).map((f) => f.id));
        job.failed = [...(job.failed || []), ...failed.filter((f) => !seen.has(f.id))].slice(0, 60);
      }
      job.cursor += batch.length;
      job.synced = job.cursor;
      job.last_step = `${job.cursor}/${job.creators.length}${job.retry_round ? ` (retry ${job.retry_round})` : ""}`;
      // Checkpoint per batch: un kill a 60s perde al massimo un batch, non
      // l'intero step (costo: 1 write KV per batch).
      job.updated_at = Date.now();
      await kv.set(JOB_KEY, job, { ex: TTL_JOB });
    }
    if (job.cursor >= job.creators.length) {
      if ((job.failed || []).length > 0 && (job.retry_round || 0) < 2) {
        job.creators = job.failed;
        job.failed = [];
        job.cursor = 0;
        job.synced = 0;
        job.retry_round = (job.retry_round || 0) + 1;
        job.last_step = `retry round ${job.retry_round}: ${job.creators.length} creator`;
      } else {
        // Finalize PRIMA di marcare done: se lancia, il catch salva il job
        // ancora "running" con cursor a fine lista → al passo successivo il
        // while viene saltato e la finalize (idempotente) viene RITENTATA.
        const fin = await finalizeLedgerPeriod(periodId, job);
        job.status = "done";
        if (fin?.warning) job.error = fin.warning;
      }
    }
    job.updated_at = Date.now();
    await kv.set(JOB_KEY, job, { ex: TTL_JOB });
    return { has_more: job.status === "running", job };
  } catch (e) {
    job.error = String(e?.message || e);
    job.updated_at = Date.now();
    await kv.set(JOB_KEY, job, { ex: TTL_JOB });
    return { has_more: true, job, retry: true, error: job.error };
  }
}

async function finalizeLedgerPeriod(periodId, job) {
  const roster = (await kv.get(ROSTER_KEY)) || [];
  const metas = roster.length ? await kv.mget(...roster.map((c) => creatorKey(periodId, c.id))) : [];
  let txCount = 0, grossC = 0, netC = 0, refunds = 0, syncedCreators = 0, truncated = 0, refundsTruncated = 0;
  metas.forEach((m) => {
    if (!m) return;
    syncedCreators++;
    txCount += m.count || 0; grossC += m.gross_c || 0; netC += m.net_c || 0;
    refunds += m.refunds || 0;
    if (m.truncated) truncated++;
    if (m.refunds_truncated) refundsTruncated++;
  });
  if (syncedCreators === 0) {
    // Tutte fallite (o roster incoerente): NON registrare il periodo come
    // sincronizzato — un mese "presente ma vuoto" passerebbe il gate
    // needs_sync e produrrebbe alberi/report a zero senza spiegazione.
    return { warning: `Nessuna creator sincronizzata per ${periodId}: periodo non finalizzato, riprova il sync` };
  }
  await kv.set(metaKey(periodId), {
    synced_at: Date.now(),
    creators_total: job.total_creators || roster.length,
    creators_synced: syncedCreators,
    failed_creators: (job.failed || []).map((f) => f.name),
    truncated_creators: truncated,
    refunds_truncated_creators: refundsTruncated,
    totals: { tx: txCount, gross_c: grossC, net_c: netC, refunds },
  }, { ex: TTL_LEDGER });
  const periods = (await kv.get(PERIODS_KEY)) || [];
  if (!periods.includes(periodId)) {
    periods.push(periodId);
    periods.sort();
    await kv.set(PERIODS_KEY, periods, { ex: TTL_LEDGER });
  }
  return {};
}

// ── Letture ────────────────────────────────────────────────────────────────
export async function getLedgerPeriods() { return (await kv.get(PERIODS_KEY)) || []; }
export async function getLedgerMeta(periodId) { return (await kv.get(metaKey(periodId))) || null; }

/** Transazioni di un set di creator per il periodo. Ritorna Map(creatorId → {meta, txns}). */
export async function readLedgerTxns(periodId, creatorIds) {
  const out = new Map();
  const ids = [...new Set(creatorIds)].filter(Boolean);
  if (ids.length === 0) return out;
  const metas = await kv.mget(...ids.map((id) => creatorKey(periodId, id)));
  const chunkFetches = [];
  ids.forEach((id, i) => {
    const meta = metas[i];
    if (!meta) { out.set(id, { meta: null, txns: [] }); return; }
    out.set(id, { meta, txns: [] });
    for (let c = 0; c < (meta.chunks || 0); c++) chunkFetches.push({ id, key: chunkKey(periodId, id, c, meta.gen || null) });
  });
  if (chunkFetches.length > 0) {
    const chunks = await kv.mget(...chunkFetches.map((c) => c.key));
    chunkFetches.forEach((cf, i) => {
      const arr = Array.isArray(chunks[i]) ? chunks[i] : [];
      out.get(cf.id).txns.push(...arr);
    });
  }
  return out;
}

/**
 * Attività per periodo: quali creator hanno transazioni nel mese e con che
 * lordo. Serve al matching alias↔creator per (a) escludere dal greedy i
 * profili senza attività (parità con reconcile, che matcha solo gli attivi)
 * e (b) il tie-break per lordo (stessa semantica di reconcile).
 */
export async function getLedgerActivity(periodId, creatorIds) {
  const ids = [...new Set(creatorIds)].filter(Boolean);
  const activeIds = new Set();
  const grossById = {};
  if (ids.length === 0) return { activeIds, grossById };
  const metas = await kv.mget(...ids.map((id) => creatorKey(periodId, id)));
  ids.forEach((id, i) => {
    const m = metas[i];
    if (m && (m.count || 0) > 0) {
      activeIds.add(id);
      grossById[id] = m.gross_c || 0;
    }
  });
  return { activeIds, grossById };
}

/** Refund di un set di creator (o di tutto il roster) per uno o più periodi. */
export async function readRefunds(periodIds, creatorIds) {
  const ids = [...new Set(creatorIds)].filter(Boolean);
  const keys = [];
  for (const p of periodIds) for (const id of ids) keys.push({ p, id, key: refundsKey(p, id) });
  if (keys.length === 0) return [];
  const vals = await kv.mget(...keys.map((k) => k.key));
  const out = [];
  keys.forEach((k, i) => {
    const arr = Array.isArray(vals[i]) ? vals[i] : [];
    for (const r of arr) out.push({ ...r, creator_id: k.id, period_id: k.p });
  });
  return out;
}
