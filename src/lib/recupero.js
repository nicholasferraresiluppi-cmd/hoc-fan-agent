// Fan da recuperare (10/10/2026) — la notte e l'archivio. Logica pura in recupero-core.js, query in recupero-sql.js.
//
// KV (namespace `recupero:*`):
//   recupero:job:{day}        stato della notte (dati → invio batch → attesa → fatto)
//   recupero:gruppi:{day}     fan scelti + chat, solo tra "dati" e "attesa" (poi si cancella)
//   recupero:lista:{day}      la lista del giorno per la pagina (senza chat), 40 giorni
//   recupero:giorni           ZSET day → per l'esito
//   recupero:stato:{key}      {status: mandato|saltato, at, by, day} di un fan (key = creator_id:user_id), 90 giorni
//   recupero:lavorati         ZSET key → at: fan lavorati di recente, che non si ripropongono per 14 giorni
//   recupero:esito            cache 6h del confronto "contattati vs no"
// La spesa AI va sullo STESSO contatore mensile di "Perché, nelle chat" (un solo tetto per l'AI di analisi).

import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import { runOnSource, splitCreators } from "@/lib/analisi-vendite";
import { RECUPERO, candidatesSql, recuperoChatSql, rebuySql } from "@/lib/recupero-sql";
import { RECUPERO_VERSION, RECUPERO_MODEL, RECUPERO_SYSTEM, RECUPERO_SCHEMA, pickFans, attachChats, buildPack, mergeResult, outcomeOf } from "@/lib/recupero-core";
import { costUSD, estimateCostUSD } from "@/lib/sales-ai/core";

const DAY_S = 86400;
// chat di 60 giorni di tutte le creator: ~2,5 GB misurati il 10/10 (fusibile a 20 GB, ~$0,12)
const BQ = { maxBytesBilled: 20 * 1024 ** 3, timeoutMs: 45_000 };
const CAP_USD = () => Number(process.env.ANALISI_AI_CAP_USD) || 60;
const spendKey = (d = new Date()) => `analisi:perche:spesa:${d.toISOString().slice(0, 7)}`;
const K = {
  job: (d) => `recupero:job:${d}`, gruppi: (d) => `recupero:gruppi:${d}`, lista: (d) => `recupero:lista:${d}`,
  giorni: "recupero:giorni", stato: (k) => `recupero:stato:${k}`, lavorati: "recupero:lavorati", esito: "recupero:esito",
};
export const todayUTC = () => new Date().toISOString().slice(0, 10);
const client = () => new Anthropic();

export async function getJob(day) { return kv.get(K.job(day)).catch(() => null); }
const saveJob = (job) => kv.set(K.job(job.day), job, { ex: 10 * DAY_S });

export async function startJob(day, { force = false, by = "cron" } = {}) {
  const ex = await getJob(day);
  if (ex && !force && ex.status !== "errore") return ex;
  const job = { day, version: RECUPERO_VERSION, status: "in_corso", stage: "dati", by, started_at: Date.now(), errors: [], spend_usd: 0 };
  await saveJob(job);
  return job;
}

export async function step(day) {
  const job = await getJob(day);
  if (!job) return { done: true };
  if (job.status !== "in_corso") return { done: true, job };
  try {
    const r = await STAGES[job.stage](job);
    await saveJob(job);
    return { done: job.status !== "in_corso", waiting: !!r?.waiting, job };
  } catch (e) {
    job.errors = [...(job.errors || []), { at: Date.now(), stage: job.stage, error: String(e?.message || e).slice(0, 400) }];
    job.fails = (job.fails || 0) + 1;
    if (job.fails >= 4) job.status = "errore";
    await saveJob(job);
    return { done: job.status !== "in_corso", error: String(e?.message || e), job };
  }
}

const STAGES = {
  async dati(job) {
    const creators = await splitCreators();
    if (!creators.length) { job.status = "fatto"; job.note = "nessuna creator negli split"; return; }
    const names = Object.fromEntries(creators.map((c) => [c.id, c.name]));
    const ids = creators.map((c) => c.id);
    const since = Date.now() - 14 * DAY_S * 1000;
    const worked = new Set(await kv.zrange(K.lavorati, since, "+inf", { byScore: true }).catch(() => []));
    const cand = await runOnSource((refs) => [candidatesSql(refs, ids, job.day)], BQ);
    let groups = pickFans(cand.rows[0], names, worked, RECUPERO.PER_CREATOR);
    const pairs = groups.flatMap((g) => g.fans.map((f) => [f.creator_id, f.user_id]));
    if (!pairs.length) { job.status = "fatto"; job.note = "nessun fan da recuperare"; await saveList(job.day, []); return; }
    const chats = await runOnSource((refs) => [recuperoChatSql(refs, pairs, job.day)], BQ);
    groups = attachChats(groups, chats.rows[0]);
    await kv.set(K.gruppi(job.day), groups, { ex: 3 * DAY_S });
    job.source = cand.source;
    job.creators = groups.length;
    job.fans = pairs.length;
    job.stage = "invio";
  },

  async invio(job) {
    const groups = (await kv.get(K.gruppi(job.day))) || [];
    const packs = groups.map((g) => buildPack(g, job.day));
    const est = packs.reduce((s, p) => s + estimateCostUSD(RECUPERO_MODEL, p.length, 2500), 0); // batch = metà prezzo
    const spent = Number(await kv.get(spendKey()).catch(() => 0)) || 0;
    if (spent + est > CAP_USD()) throw Object.assign(new Error(`tetto di spesa AI del mese ($${CAP_USD()}) raggiunto: ${spent.toFixed(2)} spesi, stima ${est.toFixed(2)}`), { fatal: true });
    const requests = groups.map((g, i) => ({
      custom_id: `g${i}`,
      params: {
        model: RECUPERO_MODEL,
        max_tokens: 12000,
        thinking: { type: "adaptive" },
        output_config: { effort: "low", format: { type: "json_schema", schema: RECUPERO_SCHEMA } },
        system: RECUPERO_SYSTEM,
        messages: [{ role: "user", content: packs[i] }],
      },
    }));
    const b = await client().beta.messages.batches.create({ requests });
    job.batch = b.id;
    job.estimate_usd = Math.round(est * 100) / 100;
    job.stage = "attesa";
  },

  async attesa(job) {
    const b = await client().beta.messages.batches.retrieve(job.batch);
    if (b.processing_status !== "ended") return { waiting: true };
    const groups = (await kv.get(K.gruppi(job.day))) || [];
    const results = {};
    let cost = 0;
    for await (const r of await client().beta.messages.batches.results(job.batch)) {
      if (r.result?.type !== "succeeded") continue;
      const msg = r.result.message;
      cost += costUSD(msg.model || RECUPERO_MODEL, msg.usage, { batch: true });
      const text = (msg.content || []).filter((x) => x.type === "text").map((x) => x.text).join("");
      try { results[r.custom_id] = JSON.parse(text.slice(text.indexOf("{"))); } catch { results[r.custom_id] = null; }
    }
    await kv.incrbyfloat(spendKey(), cost).catch(() => {});
    const list = groups.map((g, i) => ({ person: g.person, fans: mergeResult(g, results[`g${i}`], job.day), ai_ok: Boolean(results[`g${i}`]) }));
    await saveList(job.day, list, { cost, source: job.source });
    await kv.del(K.gruppi(job.day)).catch(() => {});
    job.spend_usd = Math.round(cost * 10000) / 10000;
    job.status = "fatto";
    job.stage = "fatto";
    job.finished_at = Date.now();
  },
};

async function saveList(day, list, extra = {}) {
  await kv.set(K.lista(day), { day, version: RECUPERO_VERSION, computed_at: new Date().toISOString(), list, ...extra }, { ex: 40 * DAY_S });
  await kv.zadd(K.giorni, { score: Date.parse(`${day}T00:00:00Z`), member: day }).catch(() => {});
}

/** La lista più recente (o di un giorno). */
export async function getList(day = null) {
  const d = day || (await kv.zrange(K.giorni, 0, 0, { rev: true }).catch(() => []))[0];
  return d ? kv.get(K.lista(d)).catch(() => null) : null;
}

export async function getStates(keys) {
  if (!keys.length) return {};
  const vals = await kv.mget(...keys.map(K.stato)).catch(() => []);
  return Object.fromEntries(keys.map((k, i) => [k, vals[i] || null]));
}

/** Segna un fan: "mandato" (gli è stato scritto), "saltato" (non serve / non raggiungibile), null (annulla). */
export async function setState(key, status, { by, day } = {}) {
  if (!/^\d+:\d+$/.test(key)) throw new Error("fan non valido");
  if (status === null) {
    await kv.del(K.stato(key));
    await kv.zrem(K.lavorati, key).catch(() => {});
    return null;
  }
  if (!["mandato", "saltato"].includes(status)) throw new Error("stato non valido");
  const st = { status, at: new Date().toISOString(), by: by || null, day: day || todayUTC() };
  await kv.set(K.stato(key), st, { ex: 90 * DAY_S });
  await kv.zadd(K.lavorati, { score: Date.now(), member: key }).catch(() => {});
  await kv.del(K.esito).catch(() => {});
  return st;
}

/**
 * Esito delle liste degli ultimi 30 giorni, a finestra CHIUSA (7 giorni passati): chi è stato
 * contattato ha ricomprato entro 7 giorni? Confronto con chi era in lista e non è stato contattato.
 */
export async function getOutcome({ force = false } = {}) {
  if (!force) {
    const hit = await kv.get(K.esito).catch(() => null);
    if (hit) return hit;
  }
  const now = Date.now();
  const days = await kv.zrange(K.giorni, now - 30 * DAY_S * 1000, now - RECUPERO.REBUY_DAYS * DAY_S * 1000, { byScore: true }).catch(() => []);
  const rows = new Map();
  for (const d of days) {
    const l = await kv.get(K.lista(d)).catch(() => null);
    for (const g of l?.list || []) for (const f of g.fans) if (!rows.has(f.key)) rows.set(f.key, { key: f.key, creator_id: f.creator_id, user_id: f.user_id, listed: d });
  }
  if (!rows.size) {
    const out = { ready: false, computed_at: new Date().toISOString() };
    await kv.set(K.esito, out, { ex: 6 * 3600 }).catch(() => {});
    return out;
  }
  const states = await getStates([...rows.keys()]);
  const input = [...rows.values()].map((r) => {
    const st = states[r.key];
    const sent = st?.status === "mandato";
    return { ...r, sent, from: sent ? st.at.slice(0, 10) : r.listed };
  }).filter((r) => Date.parse(`${r.from}T00:00:00Z`) <= now - RECUPERO.REBUY_DAYS * DAY_S * 1000);
  if (!input.length) return { ready: false, computed_at: new Date().toISOString() };
  const res = await runOnSource((refs) => [rebuySql(refs, input)], BQ);
  const byKey = new Map(res.rows[0].map((r) => [`${Number(r.creator_id)}:${Number(r.user_id)}`, Number(r.spent_after) || 0]));
  const out = { ready: true, computed_at: new Date().toISOString(), days: RECUPERO.REBUY_DAYS, ...outcomeOf(input.map((r) => ({ ...r, spent_after: byKey.get(r.key) || 0 }))) };
  await kv.set(K.esito, out, { ex: 6 * 3600 }).catch(() => {});
  return out;
}
