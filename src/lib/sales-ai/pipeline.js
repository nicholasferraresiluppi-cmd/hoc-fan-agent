// Sales manager AI — la catena degli uffici, una notte alla volta.
//
//   dati            BigQuery → pacchetti per operatore (codice, nessuna AI)
//   analisi_invio   due manager AI per operatore, in BATCH (metà prezzo, nessun limite dei 60s)
//   analisi_attesa  si aspetta il batch; poi il codice verifica ogni citazione dei report
//   arbitro_invio   l'arbitro-coach legge tutto e scrive il feedback (output strutturato)
//   arbitro_attesa  si aspetta il batch
//   garante         codice: blocca citazioni inventate, consigli vietati, numeri non nei dati
//   fatto           feedback "in revisione" per la direzione (o bloccati, con il motivo)
//
// Ogni chiamata a step() fa UN passo breve e salva lo stato in KV: la catena
// cron (cron-chain) richiama finché non è finito. Il tetto di spesa giornaliero
// è controllato PRIMA di ogni invio (stima) e aggiornato dopo (costo vero).

import Anthropic from "@anthropic-ai/sdk";
import { bqQuery } from "@/lib/bigquery-api";
import { romeDayBounds, romeToday, romeYesterday, buildPacks, guard, renderMessage, quoteSpeaker, costUSD, estimateCostUSD, LEVERS, METRICS, fmtMetric, VERSION } from "./core.js";
import { dayMessagesSQL, shiftsSQL, buysSQL, captionStatsSQL, captionStatsFromRows } from "./sql.js";
import { MANAGERS, managerRequest, arbiterRequest, extractQuotes, textOf, MODEL } from "./agents.js";
import * as S from "./store.js";

export { romeDayBounds, romeYesterday };

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";

const client = () => new Anthropic();
const log = (job, office, text) => {
  job.log = [...(job.log || []), { at: Date.now(), office, text }].slice(-80);
  return S.event(office, text, { day: job.day });
};

/* ─────────── avvio ─────────── */
export async function startJob(day, { force = false, by = "cron" } = {}) {
  const existing = await S.getJob(day);
  if (existing && !force && existing.status !== "errore") return existing;
  const cfg = await S.getConfig();
  const job = {
    day, version: VERSION, status: "in_corso", stage: "dati", by, started_at: Date.now(),
    creators: cfg.pilot_creators, operators: [], skipped: [], spend_usd: 0, errors: [], log: [],
  };
  await log(job, "smistamento", `Notte del ${day}: ${cfg.pilot_creators.length} creator in pilota`);
  await S.saveJob(job);
  return job;
}

/* ─────────── un passo ─────────── */
export async function step(day) {
  const job = await S.getJob(day);
  if (!job) return { done: true, reason: "nessun job" };
  if (job.status !== "in_corso") return { done: true, job };
  try {
    const r = await STAGES[job.stage](job);
    await S.saveJob(job);
    return { done: job.status !== "in_corso", waiting: !!r?.waiting, job };
  } catch (e) {
    job.errors = [...(job.errors || []), { at: Date.now(), stage: job.stage, error: String(e?.message || e).slice(0, 500) }];
    job.fails = (job.fails || 0) + 1;
    await log(job, "valutazione", `Errore in "${job.stage}": ${String(e?.message || e).slice(0, 160)}`);
    if (job.fails >= 4) job.status = "errore";
    await S.saveJob(job);
    return { done: job.status !== "in_corso", error: String(e?.message || e), job };
  }
}

const STAGES = {
  async dati(job) {
    const { start, end } = romeDayBounds(job.day);
    const q = { dataProject: DATA(), creatorIds: job.creators, dayStart: start, dayEnd: end };
    const [msg, sh, by, caps] = await Promise.all([
      bqQuery(dayMessagesSQL(q), { maxBytesBilled: 40 * 1024 ** 3, timeoutMs: 45_000 }),
      bqQuery(shiftsSQL(q), { maxBytesBilled: 2 * 1024 ** 3 }),
      bqQuery(buysSQL(q), { maxBytesBilled: 2 * 1024 ** 3 }),
      bqQuery(captionStatsSQL(q), { maxBytesBilled: 60 * 1024 ** 3, timeoutMs: 45_000 }),
    ]);
    const firstSeen = {};
    for (const r of msg.rows) if (r.first_seen) firstSeen[`${r.creator_id}:${r.user_id}`] = r.first_seen;
    const packs = buildPacks({
      messages: msg.rows.map((r) => ({ creator_id: r.creator_id, user_id: r.user_id, at: r.msg_at, out: r.out === true || r.out === "true", price: Number(r.price) || 0, text: r.text })),
      shifts: sh.rows.map((r) => ({ creator_id: r.creator_id, member_name: r.member_name, start: Date.parse(r.s), end: Date.parse(r.e) })),
      buys: by.rows.map((r) => ({ creator_id: r.creator_id, user_id: r.user_id, at: r.buy_at, amount: Number(r.amount) })),
      firstSeen, captionStats: captionStatsFromRows(caps.rows), dayStart: start, dayEnd: end,
    });
    const cfg = await S.getConfig();
    const operatorNames = [...new Set(sh.rows.map((r) => r.member_name))];
    job.operator_names = operatorNames;
    job.bq_gb = Math.round(((msg.totalBytesProcessed + sh.totalBytesProcessed + by.totalBytesProcessed + caps.totalBytesProcessed) / 1e9) * 10) / 10;

    // smistamento: chi ha abbastanza lavoro per un feedback, entro il tetto di spesa
    const spent = await S.getSpend(romeToday());
    let budget = Math.max(0, cfg.daily_cap_usd - spent);
    const chosen = [];
    for (const p of packs) {
      const key = S.opKey(p.operator, p.creator_id);
      if (p.metrics.ppv_a_mano < 3) { job.skipped.push({ key, operator: p.operator, reason: "meno di 3 PPV a mano nel turno" }); continue; }
      if (chosen.length >= cfg.max_operators) { job.skipped.push({ key, operator: p.operator, reason: "oltre il numero massimo di operatori per notte" }); continue; }
      const est = 3 * estimateCostUSD(MODEL(), JSON.stringify(p).length, 7000);
      if (est > budget) { job.skipped.push({ key, operator: p.operator, reason: `tetto di spesa giornaliero (${cfg.daily_cap_usd}$) raggiunto` }); continue; }
      budget -= est;
      // riscontro: l'impegno preso sull'ultimo feedback consegnato
      const prev = await S.lastCommitment(key, job.day);
      if (prev?.feedback?.arbiter?.regola?.leva && prev.feedback.arbiter.regola.leva !== "nessuna") {
        const lev = LEVERS[prev.feedback.arbiter.regola.leva];
        const prevPack = await S.getPack(prev.day, key);
        p.impegno_precedente = {
          giorno: prev.day,
          regola: `quando ${prev.feedback.arbiter.regola.quando}, ${prev.feedback.arbiter.regola.allora}`,
          ha_risposto: prev.reply?.commitment || null,
          metrica: lev?.metrica,
          valore_allora: prevPack?.metrics?.[lev?.metrica] ?? null,
          valore_ieri: p.metrics?.[lev?.metrica] ?? null,
        };
      }
      await S.savePack(job.day, key, p);
      chosen.push({ key, operator: p.operator, creator_id: p.creator_id, ppv: p.metrics.ppv_a_mano });
    }
    job.operators = chosen;
    await log(job, "dati", `Letti ${msg.rows.length} messaggi (${job.bq_gb} GB): ${packs.length} operatori da soli in turno, ${chosen.length} da analizzare`);
    if (job.skipped.length) await log(job, "smistamento", `${job.skipped.length} non analizzati (motivo per ognuno nel registro)`);
    job.stage = chosen.length ? "analisi_invio" : "fatto";
    if (!chosen.length) job.status = "fatto";
  },

  async analisi_invio(job) {
    const requests = [];
    // custom_id: solo [a-zA-Z0-9_-], max 64 → indice dell'operatore, non il nome
    job.operators.forEach((o, i) => { o.idx = i; });
    for (const o of job.operators) {
      const pack = await S.getPack(job.day, o.key);
      for (const m of MANAGERS) requests.push(managerRequest(m, pack, `${m.id}-${o.idx}`));
    }
    const b = await client().beta.messages.batches.create({ requests });
    job.batch_analisi = b.id;
    job.stage = "analisi_attesa";
    await log(job, "analisi", `Due manager al lavoro su ${job.operators.length} operatori (${requests.length} letture)`);
  },

  async analisi_attesa(job) {
    const b = await client().beta.messages.batches.retrieve(job.batch_analisi);
    if (b.processing_status !== "ended") return { waiting: true };
    const reports = {};
    let cost = 0;
    for await (const r of await client().beta.messages.batches.results(job.batch_analisi)) {
      const [mid, idx] = r.custom_id.split("-");
      const key = job.operators[Number(idx)]?.key;
      if (!key) continue;
      reports[key] ||= {};
      if (r.result.type === "succeeded") {
        reports[key][mid] = textOf(r.result.message);
        cost += costUSD(r.result.message.model || MODEL(), r.result.message.usage);
      } else reports[key][mid] = null;
    }
    job.spend_usd = (job.spend_usd || 0) + cost;
    await S.addSpend(romeToday(), cost);
    // verifica automatica delle citazioni dei report (codice)
    for (const o of job.operators) {
      const pack = await S.getPack(job.day, o.key);
      const rep = reports[o.key] || {};
      const lines = [];
      for (const m of MANAGERS) {
        const qs = extractQuotes(rep[m.id]);
        for (const q of qs) {
          const who = quoteSpeaker(pack, q.id, q.quote);
          lines.push(`[${m.nome}] ${q.id} «${q.quote.slice(0, 80)}» → ${who ? `TROVATA (detta da: ${who === "FAN" ? "il fan" : "l'operatore"})` : "NON TROVATA in quel momento (non usarla)"}`);
        }
      }
      await S.saveFeedback(job.day, o.key, {
        day: job.day, operator: o.operator, creator_id: o.creator_id, status: "in_lavorazione",
        reports: { qualita: rep.qualita || null, dati: rep.dati || null },
        verification: lines.join("\n") || "Nessuna citazione riconoscibile nei report.",
      });
    }
    job.stage = "arbitro_invio";
    await log(job, "analisi", `Report pronti (${cost.toFixed(2)} $). Verifica citazioni fatta dal codice`);
  },

  async arbitro_invio(job) {
    const requests = [];
    for (const o of job.operators) {
      const pack = await S.getPack(job.day, o.key);
      const fb = await S.getFeedback(job.day, o.key);
      if (!fb?.reports?.qualita && !fb?.reports?.dati) continue;
      requests.push(arbiterRequest(pack, fb.reports, fb.verification, `arbitro-${o.idx}`));
    }
    if (!requests.length) { job.stage = "fatto"; job.status = "fatto"; return; }
    const b = await client().beta.messages.batches.create({ requests });
    job.batch_arbitro = b.id;
    job.stage = "arbitro_attesa";
    await log(job, "consegne", `L'arbitro legge i due report e scrive ${requests.length} feedback`);
  },

  async arbitro_attesa(job) {
    const b = await client().beta.messages.batches.retrieve(job.batch_arbitro);
    if (b.processing_status !== "ended") return { waiting: true };
    let cost = 0, ok = 0, blocked = 0, skipped = 0;
    for await (const r of await client().beta.messages.batches.results(job.batch_arbitro)) {
      const key = job.operators[Number(r.custom_id.split("-")[1])]?.key;
      if (!key) continue;
      const fb = (await S.getFeedback(job.day, key)) || {};
      const pack = await S.getPack(job.day, key);
      if (r.result.type !== "succeeded") {
        await S.saveFeedback(job.day, key, { ...fb, status: "bloccato", guard: { ok: false, problems: [`arbitro non riuscito (${r.result.type})`] } });
        blocked++; continue;
      }
      cost += costUSD(r.result.message.model || MODEL(), r.result.message.usage);
      let arb = null;
      try { arb = JSON.parse(textOf(r.result.message)); } catch { arb = null; }
      if (!arb) {
        await S.saveFeedback(job.day, key, { ...fb, status: "bloccato", guard: { ok: false, problems: ["risposta dell'arbitro non leggibile"] } });
        blocked++; continue;
      }
      if (arb.decisione === "non_consegnare") {
        await S.saveFeedback(job.day, key, { ...fb, arbiter: arb, status: "non_consegnato", guard: { ok: true, problems: [] } });
        skipped++; continue;
      }
      // GARANTE (codice): l'ufficio rischi indipendente
      const g = guard(arb, pack, { operatorNames: job.operator_names || [] });
      const message = renderMessage(arb, pack);
      await S.saveFeedback(job.day, key, { ...fb, arbiter: arb, guard: g, message, status: g.ok ? "in_revisione" : "bloccato" });
      g.ok ? ok++ : blocked++;
    }
    job.spend_usd = (job.spend_usd || 0) + cost;
    await S.addSpend(romeToday(), cost);
    job.stage = "fatto";
    job.status = "fatto";
    job.result = { in_revisione: ok, bloccati: blocked, non_consegnati: skipped };
    await log(job, "garante", `${ok} feedback approvati dal Garante, ${blocked} bloccati, ${skipped} senza abbastanza dati`);
    await log(job, "consegne", `Notte chiusa: ${ok} feedback in attesa della revisione della direzione (spesa notte ${(job.spend_usd).toFixed(2)} $)`);
  },

  async fatto(job) { job.status = "fatto"; },
};

/** Valori delle metriche per la UI. */
export function metricRows(pack) {
  return Object.keys(METRICS).map((k) => ({ key: k, label: METRICS[k].label, value: fmtMetric(k, pack?.metrics?.[k]) }));
}
