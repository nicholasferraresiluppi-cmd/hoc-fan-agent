// Radar creator — OnlyFans cercato su Google (5/11/2026, caso @soryu_geggy_cosplay).
//
// Perché: il radar riconosce un profilo a pagamento solo se c'è un link (bio, evidenze, account
// taggato). Chi tiene Instagram e OnlyFans separati resta "nessun segnale" anche con 700k
// follower. Google però ha in archivio le pagine OnlyFans: una ricerca a creator,
// `site:onlyfans.com <nome>`, e le regole di scouting-core (matchWebResults) dicono se una delle
// pagine trovate è davvero la sua. Decisione di Nicholas: «sì, aggiungilo».
//
// Macchina a stati in KV `scouting:webcheck`, mossa dalla catena di /api/cron/scouting-webcheck:
//   1. prende un blocco di 100 account e lancia la ricerca Google su Apify (asincrona)
//   2. a run finito abbina i risultati e li scrive sui profili (il livello non scende mai)
//   3. passa al blocco dopo; ricerche non riuscite in coda per UN secondo tentativo alla fine
// Ogni settimana il dispatcher la fa ripartire sugli account nuovi (o cercati più di 90 giorni fa).
// Spesa: dal costo vero di ogni run (`usageTotalUsd`), prima di un blocco si controlla il tetto.
import { kv } from "@vercel/kv";
import { getProfiles, commitProfiles, getCrm, getForgotten } from "@/lib/scouting-store";
import { webCheckCandidates, webQuery, matchWebResults, applyWebCheck, parseGoogleItems, normHandle } from "@/lib/scouting-core";
import { apify, apifyConfigured } from "@/lib/scouting-refresh";

const KEY = "scouting:webcheck";
const ACTOR = "apify~google-search-scraper";
const BATCH = 100;
// listino misurato il 5/11/2026: ~0,35 centesimi a ricerca (una pagina di 10 risultati); margine
const MAX_PER_QUERY = 0.006;
export const WEB_CAP_USD = 15;
const REPEAT_DAYS = 7;

export const getWebCheck = async () => (await kv.get(KEY)) || null;
const save = (st) => kv.set(KEY, st);

/** Avvia (o riavvia se finita/fermata) sugli account da cercare. Ritorna lo stato. */
export async function startWebCheck({ by = null, capUsd = WEB_CAP_USD } = {}) {
  if (!apifyConfigured()) throw new Error("Manca la chiave Apify nelle impostazioni di HOC Pro.");
  const cur = await getWebCheck();
  if (cur?.status === "in_corso") return cur;
  const [profiles, crm, forgotten] = await Promise.all([getProfiles(), getCrm(), getForgotten()]);
  const queue = webCheckCandidates(profiles, crm, forgotten);
  const st = {
    status: queue.length ? "in_corso" : "fatta", startedAt: Date.now(), by, capUsd,
    total: queue.length, queue, retry: [], retried: false, done: 0,
    found: { forte: 0, simile: 0 }, failed: 0, spentUsd: 0,
    runId: null, datasetId: null, batch: [], lastError: null,
    // quante ne avevamo trovate nei giri prima: la pagina mostra il totale
    prevFound: cur ? { forte: (cur.prevFound?.forte || 0) + (cur.found?.forte || 0), simile: (cur.prevFound?.simile || 0) + (cur.found?.simile || 0) } : { forte: 0, simile: 0 },
    ...(queue.length ? {} : { endedAt: Date.now() }),
  };
  await save(st);
  return st;
}

/** Il giro settimanale: riparte da solo se l'ultimo è finito da più di 7 giorni. */
export async function maybeRestartWebCheck() {
  const cur = await getWebCheck();
  if (!cur) return startWebCheck({ by: "avvio automatico" });
  if (cur.status === "in_corso" || cur.status === "fermata") return cur;
  if (Date.now() - (cur.endedAt || 0) < REPEAT_DAYS * 86400000) return cur;
  return startWebCheck({ by: "giro settimanale", capUsd: cur.capUsd || WEB_CAP_USD });
}

export async function stopWebCheck() {
  const st = await getWebCheck();
  if (!st || st.status !== "in_corso") return st;
  if (st.runId) await apify(`/actor-runs/${st.runId}/abort`, { method: "POST" }).catch(() => {});
  const next = { ...st, status: "fermata", runId: null, endedAt: Date.now() };
  await save(next);
  return next;
}

async function collectAll(datasetId) {
  const items = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    // senza clean=1: toglierebbe il campo nascosto "#error", e una ricerca fallita passerebbe per "niente trovato"
    const page = await apify(`/datasets/${datasetId}/items?skipEmpty=1&format=json&fields=searchQuery,organicResults,%23error&offset=${offset}&limit=500`);
    items.push(...page);
    if (page.length < 500) break;
  }
  return items;
}

/**
 * Un passo. Ritorna { done } a lavoro finito, { waiting } se il run Apify sta girando,
 * altrimenti { progressed }. Non lancia mai oltre il tetto.
 */
export async function webCheckStep() {
  let st = await getWebCheck();
  if (!st || st.status !== "in_corso") return { done: true, status: st?.status || null };

  if (st.runId) {
    const run = (await apify(`/actor-runs/${st.runId}`)).data;
    if (["READY", "RUNNING"].includes(run.status)) return { waiting: true };
    const cost = Number(run.usageTotalUsd) || 0;
    st = { ...st, spentUsd: Math.round((st.spentUsd + cost) * 10000) / 10000 };
    const parsed = run.status === "SUCCEEDED" ? parseGoogleItems(await collectAll(st.datasetId)) : new Map();
    const now = Date.now();
    const results = new Map();
    const failed = [];
    for (const h of st.batch) {
      const q = webQuery(h);
      if (parsed.has(q)) results.set(h, { q, found: matchWebResults(h, parsed.get(q)) });
      else failed.push(h);
    }
    let forte = 0, simile = 0;
    if (results.size) {
      const profiles = await getProfiles();
      const next = profiles.map((p) => {
        const r = results.get(p.h);
        if (!r) return p;
        if (r.found?.strength >= 2) forte++;
        else if (r.found) simile++;
        return applyWebCheck(p, r.found, { q: r.q, now });
      });
      await commitProfiles(profiles, next);
    }
    const settled = results.size + (st.retried ? failed.length : 0);
    st = {
      ...st, done: st.done + settled, runId: null, datasetId: null, batch: [],
      found: { forte: st.found.forte + forte, simile: st.found.simile + simile },
      ...(st.retried ? { failed: st.failed + failed.length } : { retry: [...st.retry, ...failed] }),
      ...(run.status !== "SUCCEEDED" ? { lastError: `run ${run.status}` } : {}),
    };
    await save(st);
    return { progressed: true, forte, simile, failed: failed.length };
  }

  // nessun run in corso: prossimo blocco (prima la coda, poi un solo giro sulle ricerche fallite)
  if (!st.queue.length && st.retry.length && !st.retried) st = { ...st, queue: st.retry, retry: [], retried: true };
  if (!st.queue.length) {
    st = { ...st, status: "fatta", endedAt: Date.now() };
    await save(st);
    return { done: true, status: "fatta" };
  }
  const batch = st.queue.slice(0, BATCH).map(normHandle).filter(Boolean);
  const maxUsd = Math.max(0.5, batch.length * MAX_PER_QUERY);
  if (st.spentUsd + batch.length * MAX_PER_QUERY > st.capUsd) {
    st = { ...st, status: "tetto", endedAt: Date.now() };
    await save(st);
    return { done: true, status: "tetto" };
  }
  const input = {
    queries: batch.map(webQuery).join("\n"), countryCode: "it", languageCode: "it",
    maxPagesPerQuery: 1, resultsPerPage: 10, mobileResults: false, includeUnfilteredResults: false,
  };
  // Apify rifiuta i run con tetto sotto 0,50 $ (lezione del Radar clipping, PR #598)
  const res = await apify(`/acts/${ACTOR}/runs?maxTotalChargeUsd=${Math.ceil(maxUsd * 100) / 100}&timeout=3600`, { method: "POST", body: JSON.stringify(input) });
  st = { ...st, queue: st.queue.slice(BATCH), batch, runId: res.data.id, datasetId: res.data.defaultDatasetId };
  await save(st);
  return { progressed: true, launched: batch.length };
}

/** Riassunto per la pagina (senza code e dettagli dei blocchi). */
export function webCheckSummary(st) {
  if (!st) return null;
  const { queue, retry, batch, runId, datasetId, ...rest } = st;
  return { ...rest, left: Math.max(0, (st.total || 0) - (st.done || 0)), running: !!runId };
}
