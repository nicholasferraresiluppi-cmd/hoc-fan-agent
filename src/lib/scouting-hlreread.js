// Radar creator — rilettura della prima storia in evidenza (16/10/2026).
//
// Perché: la prima grande ricerca (9/10) leggeva la prima evidenza ma NON seguiva gli account
// taggati, e una lettura fallita poteva passare per "niente trovato" (casi @aliiciottaa e
// @alicelatspreferita). Decisione di Nicholas: rileggere una volta le creator ancora da
// valutare senza profilo a pagamento (~950), tetto 25 $.
//
// Macchina a stati in KV `scouting:hlreread`, mossa dalla catena di /api/cron/scouting-hlreread:
//   1. prende un blocco di 100 creator e lancia l'attore delle evidenze (asincrono)
//   2. a run finito legge per account link e tag; se ci sono tag lancia la lettura delle bio
//      degli account taggati (apify/instagram-profile-scraper: legge anche i privati)
//   3. applica al radar (il livello non scende mai) e passa al blocco dopo
// Spesa: conteggiata dal costo vero di ogni run (`usageTotalUsd`); prima di un blocco si
// controlla che il costo massimo del blocco stia nel tetto, altrimenti ci si ferma.
// Account non letti per errore: in coda per UN secondo tentativo alla fine; privati e
// spariti contati a parte, mai riprovati.
import { kv } from "@vercel/kv";
import { getProfiles, commitProfiles, getCrm, getForgotten } from "@/lib/scouting-store";
import { parseHighlightRows, applyHighlightRead, hlRereadCandidates, normHandle } from "@/lib/scouting-core";
import { apify, apifyConfigured } from "@/lib/scouting-refresh";

const KEY = "scouting:hlreread";
const HL_ACTOR = "afanasenko~instagram-stories-highlights-scraper";
const VIA_ACTOR = "apify~instagram-profile-scraper";
const BATCH = 100;
// listino dell'attore (16/10/2026): 0,01 $ ad account letto + 0,0125 $ a evidenza aperta
const HL_MAX_PER_ACCOUNT = 0.0225;
const VIA_MAX_PER_ACCOUNT = 0.005;
export const HLR_CAP_USD = 25;

export const getHlReread = async () => (await kv.get(KEY)) || null;
const save = (st) => kv.set(KEY, st);

/** Avvia (o riavvia da capo se finita/fermata). Ritorna lo stato. */
export async function startHlReread({ by = null, capUsd = HLR_CAP_USD } = {}) {
  if (!apifyConfigured()) throw new Error("Manca la chiave Apify nelle impostazioni di HOC Pro.");
  const cur = await getHlReread();
  if (cur?.status === "in_corso") return cur;
  const [profiles, crm, forgotten] = await Promise.all([getProfiles(), getCrm(), getForgotten()]);
  const queue = hlRereadCandidates(profiles, crm, forgotten);
  const st = {
    status: queue.length ? "in_corso" : "fatta", startedAt: Date.now(), by, capUsd,
    total: queue.length, queue, retry: [], retried: false, done: 0,
    found: { link: 0, tag: 0, forte: 0 }, gone: 0, failed: 0, spentUsd: 0,
    stage: null, runId: null, datasetId: null, batch: [], hl: null, lastError: null,
    ...(queue.length ? {} : { endedAt: Date.now() }),
  };
  await save(st);
  return st;
}

export async function stopHlReread() {
  const st = await getHlReread();
  if (!st || st.status !== "in_corso") return st;
  if (st.runId) await apify(`/actor-runs/${st.runId}/abort`, { method: "POST" }).catch(() => {});
  const next = { ...st, status: "fermata", runId: null, stage: null, endedAt: Date.now() };
  await save(next);
  return next;
}

async function collectAll(datasetId) {
  const items = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    const page = await apify(`/datasets/${datasetId}/items?clean=1&format=json&offset=${offset}&limit=1000`);
    items.push(...page);
    if (page.length < 1000) break;
  }
  return items;
}

async function launch(actor, input, maxUsd) {
  const res = await apify(`/acts/${actor}/runs?maxTotalChargeUsd=${Math.ceil(maxUsd * 100) / 100}&timeout=3600`, { method: "POST", body: JSON.stringify(input) });
  return { runId: res.data.id, datasetId: res.data.defaultDatasetId };
}

/** Bio degli account taggati → Map handle → { urls, priv }. */
function parseVia(items, wanted) {
  const out = new Map();
  for (const r of items) {
    const h = normHandle(r.username || "");
    if (!h || !wanted.has(h)) continue;
    const urls = new Set();
    if (r.externalUrl) urls.add(r.externalUrl);
    for (const l of Array.isArray(r.externalUrls) ? r.externalUrls : []) if (l?.url) urls.add(l.url);
    out.set(h, { urls: [...urls].slice(0, 5), priv: !!r.private });
  }
  return out;
}

/** Applica al radar le letture del blocco. Rilegge i profili subito prima di scrivere. */
async function applyBatch(st, hl, via) {
  const profiles = await getProfiles();
  const now = Date.now();
  let link = 0, tag = 0, forte = 0;
  const next = profiles.map((p) => {
    const r = hl[p.h];
    if (!r) return p;
    const q = applyHighlightRead(p, r, via, now);
    if (r.urls.length) link++;
    if (r.mentions.length) tag++;
    if (q.sig === "forte" && p.sig !== "forte") forte++;
    return q;
  });
  await commitProfiles(profiles, next);
  return { ...st, found: { link: st.found.link + link, tag: st.found.tag + tag, forte: st.found.forte + forte } };
}

/**
 * Un passo. Ritorna { done } a lavoro finito, { waiting } se un run Apify sta girando,
 * altrimenti { progressed }. Non lancia mai oltre il tetto.
 */
export async function hlRereadStep() {
  let st = await getHlReread();
  if (!st || st.status !== "in_corso") return { done: true, status: st?.status || null };

  if (st.runId) {
    const run = (await apify(`/actor-runs/${st.runId}`)).data;
    if (["READY", "RUNNING"].includes(run.status)) return { waiting: true, stage: st.stage };
    const cost = Number(run.usageTotalUsd) || 0;
    st = { ...st, spentUsd: Math.round((st.spentUsd + cost) * 10000) / 10000 };
    if (run.status !== "SUCCEEDED") {
      // run andato male: il blocco torna in coda per il secondo tentativo, si prosegue
      if (st.stage === "hl") st = st.retried ? { ...st, failed: st.failed + st.batch.length, done: st.done + st.batch.length } : { ...st, retry: [...st.retry, ...st.batch] };
      else if (st.hl) st = await applyBatch(st, st.hl, new Map()); // evidenze lette: i tag restano senza bio
      st = { ...st, runId: null, stage: null, batch: [], hl: null, lastError: `run ${run.status}` };
      await save(st);
      return { progressed: true, error: `run ${run.status}` };
    }
    const items = await collectAll(st.datasetId);
    if (st.stage === "hl") {
      const parsed = parseHighlightRows(items);
      const hl = {};
      const failed = [];
      let gone = 0;
      for (const h of st.batch) {
        const r = parsed.get(h);
        if (r?.read) hl[h] = { urls: r.urls, mentions: r.mentions };
        else if (r?.gone) gone++;
        else failed.push(h);
      }
      // "fatte" = lette o non leggibili; i non letti contano solo quando non si riprovano più
      const settled = Object.keys(hl).length + gone + (st.retried ? failed.length : 0);
      st = { ...st, done: st.done + settled, gone: st.gone + gone, ...(st.retried ? { failed: st.failed + failed.length } : { retry: [...st.retry, ...failed] }) };
      const mentions = [...new Set(Object.values(hl).flatMap((r) => r.mentions))];
      if (mentions.length && st.spentUsd + mentions.length * VIA_MAX_PER_ACCOUNT <= st.capUsd) {
        const run2 = await launch(VIA_ACTOR, { usernames: mentions }, mentions.length * VIA_MAX_PER_ACCOUNT);
        st = { ...st, stage: "via", hl, ...run2 };
        await save(st);
        return { progressed: true, stage: "via", mentions: mentions.length };
      }
      st = await applyBatch(st, hl, new Map());
      st = { ...st, runId: null, stage: null, batch: [], hl: null };
      await save(st);
      return { progressed: true };
    }
    // stage "via"
    const wanted = new Set(Object.values(st.hl || {}).flatMap((r) => r.mentions));
    st = await applyBatch(st, st.hl || {}, parseVia(items, wanted));
    st = { ...st, runId: null, stage: null, batch: [], hl: null };
    await save(st);
    return { progressed: true };
  }

  // nessun run in corso: prossimo blocco (prima la coda, poi un solo giro sui non letti)
  if (!st.queue.length && st.retry.length && !st.retried) st = { ...st, queue: st.retry, retry: [], retried: true };
  if (!st.queue.length) {
    st = { ...st, status: "fatta", endedAt: Date.now() };
    await save(st);
    return { done: true, status: "fatta" };
  }
  const batch = st.queue.slice(0, BATCH);
  const maxUsd = batch.length * HL_MAX_PER_ACCOUNT;
  if (st.spentUsd + maxUsd > st.capUsd) {
    st = { ...st, status: "tetto", endedAt: Date.now() };
    await save(st);
    return { done: true, status: "tetto" };
  }
  const run = await launch(HL_ACTOR, {
    operationMode: "highlightsByUsername", usernames: batch, maxAccounts: batch.length,
    includeHighlightItems: true, maxHighlightsPerAccount: 1, analyzeFrames: false, maxAnalyzedPerAccount: 0, skipPrivate: true,
  }, maxUsd);
  st = { ...st, queue: st.queue.slice(batch.length), batch, stage: "hl", hl: null, ...run };
  await save(st);
  return { progressed: true, stage: "hl", batch: batch.length };
}

/** Riassunto per la pagina (senza code e dettagli dei blocchi). */
export function hlRereadSummary(st) {
  if (!st) return null;
  const { queue, retry, batch, hl, runId, datasetId, ...rest } = st;
  return { ...rest, left: Math.max(0, (st.total || 0) - (st.done || 0)), running: !!runId };
}
