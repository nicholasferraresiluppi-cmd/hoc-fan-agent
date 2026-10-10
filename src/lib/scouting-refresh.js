// Radar creator — giro settimanale su Apify (decisione di Nicholas 10/10/2026: tutte le
// creator ogni settimana, ~1 centesimo a profilo → ~12 $/settimana con ~1.200 profili).
//
// Macchina a stati in KV `scouting:refresh`, mossa una volta al giorno dal dispatcher:
//   1. nessun giro in corso e ultimo completato da più di 6,5 giorni → LANCIA un run Apify
//      (asincrono: un giro su 1.200 profili dura ~20 minuti, più della vita di una funzione)
//   2. run in corso → non fa niente (si riguarda domani)
//   3. run finito → scarica i risultati a pagine, aggiorna numeri e storico, chiude il giro
// Il costo è limitato due volte: maxBudgetUsd nell'input dell'attore e maxTotalChargeUsd sul run.
// Strumento: afanasenko/instagram-profile-scraper (legge anche i profili con limite d'età,
// a differenza di apify/instagram-profile-scraper — verificato il 9/10/2026).
import { getProfiles, saveProfiles, getRefreshState, setRefreshState, getForgotten } from "@/lib/scouting-store";
import { applyRefresh, applyPartialRefresh, weekKey } from "@/lib/scouting-core";

const ACTOR = "afanasenko~instagram-profile-scraper";
const API = "https://api.apify.com/v2";
const PRICE_PER_PROFILE = 0.01;
const MIN_DAYS = 6.5;
const FIELDS = ["Account", "Followers Count", "Median Views", "Views.Followers Ratio", "Median ER", "External URL", "Biography", "Analysis Status", "Profile Picture"].join(",");

export const apifyConfigured = () => Boolean(process.env.APIFY_TOKEN);

async function apify(path, init = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`${API}${path}${sep}token=${encodeURIComponent(process.env.APIFY_TOKEN)}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Apify ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function startRun(handles) {
  const budget = Math.ceil(handles.length * PRICE_PER_PROFILE * 1.1 * 100) / 100;
  const input = {
    operationMode: "analyzeSpecificAccounts",
    specificUsernamesList: handles,
    maxCountList: handles.length,
    extractEmail: false,
    extractPhoneNumber: false,
    extractWebsiteUrl: true,
    extractBusinessCategory: false,
    analyzeQuality: true,
    extractPosts: false,
    maxBudgetUsd: budget,
  };
  const res = await apify(`/acts/${ACTOR}/runs?maxTotalChargeUsd=${budget + 0.5}&timeout=7200`, { method: "POST", body: JSON.stringify(input) });
  return { runId: res.data.id, datasetId: res.data.defaultDatasetId, budget };
}

async function collect(datasetId) {
  const items = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const page = await apify(`/datasets/${datasetId}/items?clean=1&format=json&offset=${offset}&limit=1000&fields=${encodeURIComponent(FIELDS)}`);
    items.push(...page);
    if (page.length < 1000) break;
  }
  return items;
}

/** Applica il risultato di un run già fatto (es. giro delle foto) solo ai profili che contiene. */
export async function applyDatasetPartial(datasetId) {
  if (!/^[A-Za-z0-9]{8,30}$/.test(String(datasetId || ""))) throw new Error("dataset non valido");
  const items = await collect(datasetId);
  const res = applyPartialRefresh(await getProfiles(), items);
  await saveProfiles(res.profiles);
  return { items: items.length, updated: res.updated, pics: res.pics };
}

/** Un passo della macchina a stati. `force` = lancia anche se l'ultimo giro è recente (bottone admin). */
export async function scoutingTick({ force = false } = {}) {
  if (!apifyConfigured()) return { skip: "no-apify-token" };
  const st = await getRefreshState();
  if (st.runId) {
    const run = (await apify(`/actor-runs/${st.runId}`)).data;
    if (["READY", "RUNNING"].includes(run.status)) return { running: st.runId, since: st.startedAt };
    if (run.status !== "SUCCEEDED") {
      await setRefreshState({ ...st, runId: null, lastError: `giro ${run.status}`, lastErrorAt: Date.now() });
      return { error: `giro ${run.status}` };
    }
    const items = await collect(st.datasetId);
    const res = applyRefresh(await getProfiles(), items);
    await saveProfiles(res.profiles);
    const done = { lastCompletedAt: Date.now(), lastWeek: weekKey(new Date()), lastUpdated: res.updated, lastMissing: res.missing, lastCostUsd: run.usageTotalUsd ?? null };
    await setRefreshState({ ...done, runId: null, pausedUntil: st.pausedUntil ?? null });
    return { completed: done };
  }
  // Pausa decisa da un admin (budget Apify dirottato sulla ricerca): il bottone "Aggiorna ora" la scavalca.
  if (!force && st.pausedUntil && Date.now() < st.pausedUntil) return { paused: true, until: st.pausedUntil };
  const daysSince = st.lastCompletedAt ? (Date.now() - st.lastCompletedAt) / 86400000 : Infinity;
  if (!force && daysSince < MIN_DAYS) return { idle: true, nextInDays: Math.round((MIN_DAYS - daysSince) * 10) / 10 };
  const forgotten = await getForgotten();
  const handles = (await getProfiles()).map((p) => p.h).filter((h) => !forgotten.has(h));
  if (!handles.length) return { skip: "nessun profilo" };
  const run = await startRun(handles);
  await setRefreshState({ ...st, ...run, startedAt: Date.now(), count: handles.length, lastError: null });
  return { started: run.runId, count: handles.length, budget: run.budget };
}
