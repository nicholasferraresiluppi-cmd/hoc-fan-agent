/**
 * Infloww Sync Job — orchestrazione server-side, stato in KV.
 *
 * Rende la vista agency ESATTA e ISTANTANEA: invece del read-through live
 * (che tronca le big creator per stare sotto i 60s), un job pesca TUTTE le
 * transazioni del periodo per ogni creator e salva aggregati GIORNALIERI per
 * creator in KV. Qualsiasi finestra (7/14/30gg) è poi una semplice somma di
 * giorni → risposta immediata, nessun troncamento.
 *
 * Stato job (KV `infloww:syncjob`):
 *   { days, creators:[{id,name,userName}], cursor, synced, status, error?,
 *     started_at, updated_at, last_step }
 * Un `stepJob()` processa creator finché non sfora il budget di tempo (~40s),
 * poi ritorna: il driver (client o cron) lo richiama in loop.
 *
 * KV:
 *   infloww:creators           roster [{id,name,userName}]
 *   infloww:daily:{creatorId}  { name, userName, updated_at, days:{ "YYYY-MM-DD": {net,gross,fee,tx,byType} } }
 *   infloww:sync:meta          { last_sync_at, days, creators_total }
 */
import { kv } from "@vercel/kv";
import { inflowwPaged, centsToUsd } from "./infloww-api";

const JOB_KEY = "infloww:syncjob";
const ROSTER_KEY = "infloww:creators";
const META_KEY = "infloww:sync:meta";
const dailyKey = (id) => `infloww:daily:${id}`;
const TTL_JOB = 6 * 3600;
const TTL_DATA = 100 * 24 * 3600;
const STEP_BUDGET_MS = 40000;
const CONC = 3;

const r2 = (x) => Math.round(x * 100) / 100;
const romeDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
const romeDay = (ms) => { const n = Number(ms); return Number.isFinite(n) ? romeDayFmt.format(new Date(n)) : "?"; };

export async function getJob() { return (await kv.get(JOB_KEY)) || null; }

export function jobProgress(job) {
  if (!job) return null;
  return {
    status: job.status,
    synced: job.synced || 0,
    total: job.creators?.length || 0,
    last_step: job.last_step || null,
    error: job.error || null,
  };
}

export async function startJob(days = 31) {
  const d = Math.min(60, Math.max(1, Number(days) || 31));
  const { items } = await inflowwPaged("/v1/creators", { query: { platformCode: "OnlyFans" }, limit: 100, maxPages: 5 });
  const creators = items.map((c) => ({ id: c.id, name: c.name || c.userName || String(c.id), userName: c.userName || "" }));
  await kv.set(ROSTER_KEY, creators, { ex: TTL_DATA });
  const job = { days: d, creators, cursor: 0, synced: 0, status: "running", started_at: Date.now(), updated_at: Date.now(), last_step: "start" };
  await kv.set(JOB_KEY, job, { ex: TTL_JOB });
  return job;
}

async function syncOneCreator(creator, startTime, endTime) {
  const { items } = await inflowwPaged("/v1/transactions", {
    query: { creatorId: creator.id, startTime, endTime, platformCode: "OnlyFans" },
    limit: 100, maxPages: 80, timeoutMs: 12000,
  });
  const days = {};
  for (const t of items) {
    const d = romeDay(t.createdTime);
    if (!days[d]) days[d] = { net: 0, gross: 0, fee: 0, tx: 0, byType: {} };
    const n = centsToUsd(t.net);
    days[d].net += n; days[d].gross += centsToUsd(t.amount); days[d].fee += centsToUsd(t.fee); days[d].tx++;
    const ty = t.type || "?";
    days[d].byType[ty] = (days[d].byType[ty] || 0) + n;
  }
  for (const d of Object.keys(days)) {
    const x = days[d];
    x.net = r2(x.net); x.gross = r2(x.gross); x.fee = r2(x.fee);
    for (const k of Object.keys(x.byType)) x.byType[k] = r2(x.byType[k]);
  }
  // Merge: i giorni ri-pescati sovrascrivono (dato fresco), quelli fuori finestra restano.
  const prev = (await kv.get(dailyKey(creator.id))) || { days: {} };
  await kv.set(dailyKey(creator.id), {
    name: creator.name, userName: creator.userName, updated_at: Date.now(),
    days: { ...(prev.days || {}), ...days },
  }, { ex: TTL_DATA });
  return items.length;
}

export async function stepJob() {
  const job = await getJob();
  if (!job || job.status !== "running") return { has_more: false, job };

  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - job.days * 86400000).toISOString();
  const start = Date.now();
  try {
    while (job.cursor < job.creators.length && (Date.now() - start) < STEP_BUDGET_MS) {
      const batch = job.creators.slice(job.cursor, job.cursor + CONC);
      await Promise.all(batch.map((c) => syncOneCreator(c, startTime, endTime).catch(() => 0)));
      job.cursor += batch.length;
      job.synced = job.cursor;
      job.last_step = `${job.cursor}/${job.creators.length}`;
    }
    if (job.cursor >= job.creators.length) {
      job.status = "done";
      await kv.set(META_KEY, { last_sync_at: Date.now(), days: job.days, creators_total: job.creators.length }, { ex: TTL_DATA });
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

/**
 * Somma per creator gli aggregati KV di uno specifico mese ("YYYY-MM").
 * Usato dalla reconciliation Infloww↔CP. Ritorna lordo+netto per creator
 * (subs incluse: pesano ~1%, trascurabili per un confronto direzionale).
 */
export async function readMonthlyByCreator(periodId) {
  const roster = (await kv.get(ROSTER_KEY)) || [];
  if (!Array.isArray(roster) || roster.length === 0) return { needs_sync: true, creators: [] };
  const dailies = await kv.mget(...roster.map((c) => dailyKey(c.id)));
  const meta = await kv.get(META_KEY);
  const creators = roster.map((c, i) => {
    const dd = dailies[i]?.days || {};
    let net = 0, gross = 0, tx = 0, daysCovered = 0;
    for (const [day, v] of Object.entries(dd)) {
      if (!day.startsWith(periodId)) continue;
      net += v.net; gross += v.gross; tx += v.tx; daysCovered++;
    }
    return { id: c.id, name: c.name, userName: c.userName, net: r2(net), gross: r2(gross), tx, days_covered: daysCovered };
  });
  return { creators, last_sync_at: meta?.last_sync_at || null };
}

/**
 * Legge gli aggregati KV e somma i giorni della finestra richiesta.
 * Ritorna la stessa shape del read-through live, ma esatta e istantanea.
 */
export async function readAgency(days) {
  const d = Math.min(60, Math.max(1, Number(days) || 7));
  const [meta, roster] = await Promise.all([kv.get(META_KEY), kv.get(ROSTER_KEY)]);
  if (!Array.isArray(roster) || roster.length === 0) return { needs_sync: true, window_days: d };

  const dailies = await kv.mget(...roster.map((c) => dailyKey(c.id)));
  const cutoff = romeDay(Date.now() - (d - 1) * 86400000);

  let net = 0, gross = 0, fee = 0, tx = 0;
  const byType = {}, byDay = {};
  const creators = [];
  roster.forEach((c, i) => {
    const dd = dailies[i]?.days || {};
    let cnet = 0, cgross = 0, cfee = 0, ctx = 0;
    const cByType = {};
    for (const [day, v] of Object.entries(dd)) {
      if (day < cutoff) continue;
      cnet += v.net; cgross += v.gross; cfee += v.fee; ctx += v.tx;
      byDay[day] = (byDay[day] || 0) + v.net;
      for (const [k, val] of Object.entries(v.byType || {})) { byType[k] = (byType[k] || 0) + val; cByType[k] = (cByType[k] || 0) + val; }
    }
    let topType = null, topN = -1;
    for (const [k, v] of Object.entries(cByType)) if (v > topN) { topN = v; topType = k; }
    net += cnet; gross += cgross; fee += cfee; tx += ctx;
    creators.push({ id: c.id, name: c.name, userName: c.userName, net: r2(cnet), gross: r2(cgross), tx: ctx, topType });
  });

  return {
    source: "kv",
    exact: true,
    window_days: d,
    last_sync_at: meta?.last_sync_at || null,
    synced_days: meta?.days || null,
    loaded: roster.length,
    total_creators: roster.length,
    totals: { net_usd: r2(net), gross_usd: r2(gross), fee_usd: r2(fee), tx_count: tx },
    by_type: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, r2(v)])),
    trend: Object.entries(byDay).map(([date, v]) => ({ date, net_usd: r2(v) })).sort((a, b) => a.date.localeCompare(b.date)),
    creators: creators.sort((a, b) => b.net - a.net),
  };
}
