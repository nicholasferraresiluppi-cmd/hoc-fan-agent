// Radar salary — archivio, magazzino e Apify (16/11/2026). Logica pura in salary-radar-core.js.
//
// Chiavi (namespace isolato `salradar:*`, nessun'altra parte dell'app le legge):
//   salradar:store          gz1 { models: {id: {id,name,side,agency,note,by,at}},
//                                 accounts: {h: {h,modelId,by,at,last,hist,checkedAt,miss,gone}},
//                                 talents: [nomi del magazzino considerati salary] }
//   salradar:wh:{hash}      righe del magazzino per le salary scelte (cache 6 h: il magazzino è giornaliero)
//   salradar:talents        modelle presenti nel magazzino, per la scelta (cache 24 h)
//   salradar:refresh        giro settimanale Apify sugli account aggiunti a mano { runId, datasetId, … }
//   salradar:searches       ultime ricerche { id, kind, q, runId, datasetId, status, at, by, cands }
//   salradar:spend:{mese}   dollari Apify spesi dal radar nel mese (tetto MONTHLY_CAP_USD)
//
// Magazzino: instagram.cache_accounts_creators, SOLO organizzazioni HOC e Vibes Ventures (il
// magazzino contiene anche agenzie clienti: mai leggere le loro). Pochi MB a lettura.
import { kv } from "@vercel/kv";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash, randomUUID } from "node:crypto";
import { bqQuery, bqProjects, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { apify, apifyConfigured } from "@/lib/scouting-refresh";
import { parseRefreshItem, weekKey, weeklyRunDue } from "@/lib/scouting-core";
import {
  DEFAULT_TALENTS, DAYS, SEARCH_KINDS, MONTHLY_CAP_USD, monthKey,
  buildOurModels, buildManualModels, applyRead, parseCandidates, normHandle, validHandle, slug,
} from "@/lib/salary-radar-core";

export { bigQueryConfigured, apifyConfigured };

// Vibes Ventures: l'organizzazione dove nascono le salary dell'altro split (vedi CLAUDE.md, memoria vibes-ventures-org)
export const VIBES_ORGANIZATION_ID = "c2d7b648-743c-41ad-9215-db2021e1439f";
const ORGS = [HOC_ORGANIZATION_ID, VIBES_ORGANIZATION_ID];

const STORE = "salradar:store";
const REFRESH = "salradar:refresh";
const SEARCHES = "salradar:searches";
const SPEND = (m) => `salradar:spend:${m}`;
const WH_TTL = 6 * 3600;
const PROFILE_ACTOR = "afanasenko~instagram-profile-scraper";
const PRICE_PER_PROFILE = 0.012;
const MAX_ADD = 25;

const GZ = "gz1:";
const enc = (v) => GZ + gzipSync(Buffer.from(JSON.stringify(v), "utf8")).toString("base64");
const dec = (raw, fallback) => {
  if (typeof raw === "string" && raw.startsWith(GZ)) return JSON.parse(gunzipSync(Buffer.from(raw.slice(GZ.length), "base64")).toString("utf8"));
  return raw ?? fallback;
};
const sqlStr = (s) => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

// ---------- archivio ----------

export async function getStore() {
  const s = dec(await kv.get(STORE), null) || {};
  return { models: s.models || {}, accounts: s.accounts || {}, talents: Array.isArray(s.talents) ? s.talents : DEFAULT_TALENTS };
}
async function saveStore(s) {
  await kv.set(STORE, enc({ models: s.models, accounts: s.accounts, talents: s.talents }));
}

// ---------- magazzino ----------

export async function loadTalentList({ force = false } = {}) {
  if (!bigQueryConfigured()) return [];
  if (!force) {
    const hit = await kv.get("salradar:talents").catch(() => null);
    if (hit) return typeof hit === "string" ? JSON.parse(hit) : hit;
  }
  const { dataProject } = bqProjects();
  const { rows } = await bqQuery(`
    SELECT talent_name t, COUNT(DISTINCT owner_username) n, SUM(followed_by) fol
    FROM \`${dataProject}.instagram.cache_accounts_creators\`
    WHERE date_key >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) AND talent_name IS NOT NULL
      AND organization_id IN (${ORGS.map(sqlStr).join(",")})
    GROUP BY 1 ORDER BY fol DESC`, { maxBytesBilled: 1024 ** 3 });
  const out = rows.map((r) => ({ t: r.t, n: Number(r.n) || 0, fol: Number(r.fol) || 0 }));
  await kv.set("salradar:talents", JSON.stringify(out), { ex: 24 * 3600 }).catch(() => {});
  return out;
}

export async function loadOurRows(talents, { force = false } = {}) {
  if (!bigQueryConfigured() || !talents.length) return null;
  const list = [...new Set(talents)].sort();
  const key = `salradar:wh:${createHash("sha1").update(list.join("|")).digest("hex").slice(0, 16)}`;
  if (!force) {
    const hit = await kv.get(key).catch(() => null);
    if (hit) return dec(hit, null);
  }
  const { dataProject } = bqProjects();
  const { rows } = await bqQuery(`
    SELECT talent_name t, LOWER(owner_username) u, FORMAT_DATE('%Y-%m-%d', date_key) d,
      STRING_AGG(DISTINCT creator_name, ' / ') c,
      MAX(followed_by) fol,
      MAX(GREATEST(IFNULL(reels_count_diff, 0), 0)) reels,
      MAX(GREATEST(IFNULL(reels_play_count_diff, 0), 0)) views,
      MAX(GREATEST(IFNULL(unique_visitors_count_diff, 0), 0)) clicks,
      MAX(GREATEST(IFNULL(subs_diff, 0), 0)) subs,
      ANY_VALUE(bio_link) link, LOGICAL_OR(is_private) priv
    FROM \`${dataProject}.instagram.cache_accounts_creators\`
    WHERE date_key >= DATE_SUB(CURRENT_DATE(), INTERVAL ${DAYS} DAY)
      AND organization_id IN (${ORGS.map(sqlStr).join(",")})
      AND talent_name IN (${list.map(sqlStr).join(",")})
    GROUP BY 1, 2, 3`, { maxBytesBilled: 2 * 1024 ** 3 });
  const out = { at: Date.now(), rows };
  await kv.set(key, enc(out), { ex: WH_TTL }).catch(() => {});
  return out;
}

/** Tutto quello che serve alla pagina. */
export async function getRadar({ force = false } = {}) {
  const store = await getStore();
  let ours = { day: null, models: [] }, whAt = null, whError = null;
  try {
    const wh = await loadOurRows(store.talents, { force });
    if (wh) { ours = buildOurModels(wh.rows, { talents: store.talents }); whAt = wh.at; }
  } catch (e) {
    whError = e?.message || "errore del magazzino";
  }
  const manual = buildManualModels(store);
  return {
    day: ours.day, whAt, whError,
    ours: [...ours.models, ...manual.filter((m) => m.side === "nostra")],
    altre: manual.filter((m) => m.side === "altra"),
    talents: store.talents,
    refresh: await kv.get(REFRESH).catch(() => null) || {},
    spend: { month: monthKey(), usd: Number(await kv.get(SPEND(monthKey())).catch(() => 0)) || 0, cap: MONTHLY_CAP_USD },
    configured: { bigquery: bigQueryConfigured(), apify: apifyConfigured() },
  };
}

// ---------- spesa ----------

async function spent() { return Number(await kv.get(SPEND(monthKey())).catch(() => 0)) || 0; }
async function addSpend(usd) {
  if (!(usd > 0)) return;
  const k = SPEND(monthKey());
  await kv.incrbyfloat(k, Math.round(usd * 1000) / 1000).catch(() => {});
  await kv.expire(k, 70 * 86400).catch(() => {});
}
async function checkBudget(usd) {
  const s = await spent();
  if (s + usd > MONTHLY_CAP_USD) throw Object.assign(new Error(`Tetto del mese raggiunto (${s.toFixed(2)} $ su ${MONTHLY_CAP_USD} $): le ricerche ripartono il mese prossimo.`), { status: 429 });
}

// ---------- Apify ----------

const API = "https://api.apify.com/v2";
async function runSync(actor, input, { maxUsd, timeout = 120 }) {
  const url = `${API}/acts/${actor}/run-sync-get-dataset-items?timeout=${timeout}&maxTotalChargeUsd=${maxUsd}&token=${encodeURIComponent(process.env.APIFY_TOKEN)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" });
  const text = await r.text();
  if (!r.ok) throw new Error(`Apify ${r.status}: ${text.slice(0, 160)}`);
  const data = text ? JSON.parse(text) : [];
  return Array.isArray(data) ? data : [];
}
const profileInput = (handles, budget) => ({
  operationMode: "analyzeSpecificAccounts", specificUsernamesList: handles, maxCountList: handles.length,
  extractEmail: false, extractPhoneNumber: false, extractWebsiteUrl: true, extractBusinessCategory: false,
  analyzeQuality: true, extractPosts: false, maxBudgetUsd: budget,
});

/** Legge subito follower, view mediane e link di pochi account (aggiunta dalla pagina). */
async function readProfilesNow(handles) {
  const budget = Math.ceil(handles.length * PRICE_PER_PROFILE * 1.2 * 100) / 100 + 0.02;
  await checkBudget(budget);
  const rows = await runSync(PROFILE_ACTOR, profileInput(handles, budget), { maxUsd: budget + 0.05, timeout: 240 });
  await addSpend(handles.length * PRICE_PER_PROFILE);
  const by = new Map();
  for (const it of rows) { const p = parseRefreshItem(it); if (p) by.set(p.h, p); }
  return by;
}

// ---------- modifiche ----------

export function newModelId(name) { return `m:${slug(name)}-${randomUUID().slice(0, 6)}`; }

/**
 * Aggiunge account a una modella (esistente o nuova). Gli account già presenti vengono spostati,
 * quelli che il magazzino segue già come nostri vengono rifiutati (si vedono già in «Le nostre»).
 */
export async function addAccounts({ handles, modelId, newModel, by, ourHandles = new Set(), read = true }) {
  const list = [...new Set((handles || []).map(normHandle).filter(validHandle))].slice(0, MAX_ADD);
  if (!list.length) throw Object.assign(new Error("Nessun account valido: incolla link di profili Instagram o @nomi."), { status: 400 });
  const store = await getStore();
  let id = modelId;
  if (!id || !store.models[id]) {
    const name = String(newModel?.name || "").trim().slice(0, 60);
    if (!name) throw Object.assign(new Error("Scegli la modella o scrivi il nome di una nuova."), { status: 400 });
    id = newModelId(name);
    store.models[id] = { id, name, side: newModel?.side === "nostra" ? "nostra" : "altra", agency: String(newModel?.agency || "").trim().slice(0, 60), note: "", by: by || null, at: Date.now() };
  }
  const skipped = list.filter((h) => ourHandles.has(h));
  const todo = list.filter((h) => !ourHandles.has(h));
  for (const h of todo) {
    const prev = store.accounts[h];
    store.accounts[h] = prev ? { ...prev, modelId: id } : { h, modelId: id, by: by || null, at: Date.now(), hist: [] };
  }
  let readErr = null, readN = 0;
  if (read && todo.length && apifyConfigured()) {
    try {
      const got = await readProfilesNow(todo);
      const week = weekKey(new Date());
      for (const h of todo) {
        const p = got.get(h);
        store.accounts[h] = applyRead(store.accounts[h], p || null, { week });
        if (p) readN++;
      }
    } catch (e) { readErr = e?.message || "lettura non riuscita"; }
  }
  // rilettura prima di salvare: chi ha scritto nel frattempo non si perde (le modifiche sono su chiavi distinte)
  const fresh = await getStore();
  fresh.models[id] = store.models[id];
  for (const h of todo) fresh.accounts[h] = store.accounts[h];
  await saveStore(fresh);
  return { modelId: id, added: todo, skipped, read: readN, readErr };
}

export async function updateModel(id, patch) {
  const store = await getStore();
  const m = store.models[id];
  if (!m) throw Object.assign(new Error("Modella non trovata."), { status: 404 });
  if (patch.name != null) m.name = String(patch.name).trim().slice(0, 60) || m.name;
  if (patch.agency != null) m.agency = String(patch.agency).trim().slice(0, 60);
  if (patch.note != null) m.note = String(patch.note).trim().slice(0, 600);
  if (patch.side != null) m.side = patch.side === "nostra" ? "nostra" : "altra";
  await saveStore(store);
  return m;
}

export async function deleteModel(id) {
  const store = await getStore();
  if (!store.models[id]) throw Object.assign(new Error("Modella non trovata."), { status: 404 });
  delete store.models[id];
  for (const [h, a] of Object.entries(store.accounts)) if (a.modelId === id) delete store.accounts[h];
  await saveStore(store);
}

export async function removeAccount(h) {
  const store = await getStore();
  delete store.accounts[normHandle(h)];
  await saveStore(store);
}

export async function moveAccount(h, modelId) {
  const store = await getStore();
  const a = store.accounts[normHandle(h)];
  if (!a || !store.models[modelId]) throw Object.assign(new Error("Account o modella non trovati."), { status: 404 });
  a.modelId = modelId;
  await saveStore(store);
}

export async function setTalents(list) {
  const store = await getStore();
  store.talents = [...new Set((list || []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 40);
  await saveStore(store);
  return store.talents;
}

// ---------- giro settimanale sugli account aggiunti a mano ----------

export async function salaryRadarTick({ force = false } = {}) {
  if (!apifyConfigured()) return { skip: "no-apify-token" };
  const st = (await kv.get(REFRESH)) || {};
  if (st.runId) {
    const run = (await apify(`/actor-runs/${st.runId}`)).data;
    if (["READY", "RUNNING"].includes(run.status)) return { running: st.runId };
    if (run.status !== "SUCCEEDED") {
      await kv.set(REFRESH, { ...st, runId: null, runWeek: null, lastError: `giro ${run.status}`, lastErrorAt: Date.now() });
      return { error: `giro ${run.status}` };
    }
    const items = await apify(`/datasets/${st.datasetId}/items?clean=1&format=json&limit=5000`);
    const by = new Map();
    for (const it of items || []) { const p = parseRefreshItem(it); if (p) by.set(p.h, p); }
    const store = await getStore();
    // settimana del lancio (i numeri si leggono lì), non della raccolta — come il Radar creator
    const week = weekKey(new Date(st.startedAt || Date.now()));
    let updated = 0;
    for (const h of st.handles || []) {
      if (!store.accounts[h]) continue;
      store.accounts[h] = applyRead(store.accounts[h], by.get(h) || null, { week });
      if (by.has(h)) updated++;
    }
    await saveStore(store);
    await addSpend(run.usageTotalUsd || 0);
    const done = { lastCompletedAt: Date.now(), lastWeek: week, runWeek: st.runWeek || week, lastUpdated: updated, lastCount: (st.handles || []).length, lastCostUsd: run.usageTotalUsd ?? null };
    await kv.set(REFRESH, done);
    return { completed: done };
  }
  // una volta per settimana ISO (26/11/2026; prima 6,5 giorni dall'ultimo completato = ciclo di 8 giorni).
  // Stati vecchi senza runWeek: si ricava dalla data dell'ultimo giro completato.
  const legacy = !st.runWeek && !st.lastWeek && st.lastCompletedAt ? { lastWeek: weekKey(new Date(st.lastCompletedAt)) } : null;
  if (!force && !weeklyRunDue(legacy || st)) return { idle: true, week: st.runWeek || st.lastWeek || legacy?.lastWeek };
  const handles = Object.keys((await getStore()).accounts);
  if (!handles.length) return { skip: "nessun account" };
  const budget = Math.ceil(handles.length * PRICE_PER_PROFILE * 1.15 * 100) / 100 + 0.1;
  await checkBudget(budget);
  const res = await apify(`/acts/${PROFILE_ACTOR}/runs?maxTotalChargeUsd=${budget + 0.3}&timeout=3600`, { method: "POST", body: JSON.stringify(profileInput(handles, budget)) });
  await kv.set(REFRESH, { ...st, runId: res.data.id, datasetId: res.data.defaultDatasetId, startedAt: Date.now(), runWeek: weekKey(new Date()), handles, lastError: null });
  return { started: res.data.id, count: handles.length };
}

// ---------- ricerca ----------

const SEARCH_ACTORS = {
  parola: { actor: "apify~instagram-search-scraper", input: (q, n) => ({ search: q, searchType: "user", searchLimit: n }) },
  seguiti: { actor: "scraping_solutions~instagram-scraper-followers-following-no-cookies", input: (q) => ({ Account: [q], resultsLimit: 1500, dataToScrape: "Followings" }) },
};

export async function getSearches() { return dec(await kv.get(SEARCHES), []) || []; }
async function saveSearches(list) { await kv.set(SEARCHES, enc(list.slice(0, 8))); }

export async function startSearch({ kind, q, by }) {
  const k = SEARCH_KINDS[kind], a = SEARCH_ACTORS[kind];
  if (!k || !a) throw Object.assign(new Error("Tipo di ricerca non valido."), { status: 400 });
  if (!apifyConfigured()) throw Object.assign(new Error("Manca la chiave Apify."), { status: 503 });
  const query = kind === "seguiti" ? normHandle(q) : String(q || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (kind === "seguiti" ? !validHandle(query) : query.length < 2) throw Object.assign(new Error(kind === "seguiti" ? "Scrivi l'account da cui partire (@nome o link)." : "Scrivi almeno due lettere."), { status: 400 });
  const budget = kind === "seguiti" ? 0.6 : 0.3;
  await checkBudget(budget);
  const res = await apify(`/acts/${a.actor}/runs?maxTotalChargeUsd=${budget}&timeout=900`, { method: "POST", body: JSON.stringify(a.input(query, k.max)) });
  const item = { id: randomUUID().slice(0, 8), kind, q: query, runId: res.data.id, datasetId: res.data.defaultDatasetId, status: "in_corso", at: Date.now(), by: by || null, cands: [] };
  await saveSearches([item, ...(await getSearches())]);
  return item;
}

/** Guarda una ricerca in corso; se è finita ne legge i risultati e li tiene. */
export async function pollSearch(id, known = new Set()) {
  const list = await getSearches();
  const s = list.find((x) => x.id === id);
  if (!s) throw Object.assign(new Error("Ricerca non trovata."), { status: 404 });
  if (s.status !== "in_corso") return { ...s, cands: s.cands.map((c) => ({ ...c, known: known.has(c.h) })) };
  const run = (await apify(`/actor-runs/${s.runId}`)).data;
  if (["READY", "RUNNING"].includes(run.status)) return s;
  if (run.status !== "SUCCEEDED") {
    s.status = "errore"; s.error = `ricerca ${run.status}`;
  } else {
    const items = await apify(`/datasets/${s.datasetId}/items?clean=1&format=json&limit=2000`);
    s.cands = parseCandidates(items, known).slice(0, 400);
    s.status = "finita";
    s.usd = run.usageTotalUsd ?? null;
    await addSpend(run.usageTotalUsd || 0);
  }
  await saveSearches(list.map((x) => (x.id === id ? s : x)));
  return s;
}

/** Legge i numeri di alcuni candidati di una ricerca (follower, view mediane, link), senza aggiungerli. */
export async function readCandidates(id, handles) {
  const list = await getSearches();
  const s = list.find((x) => x.id === id);
  if (!s) throw Object.assign(new Error("Ricerca non trovata."), { status: 404 });
  const want = [...new Set((handles || []).map(normHandle).filter(validHandle))].slice(0, MAX_ADD);
  if (!want.length) return s;
  const got = await readProfilesNow(want);
  s.cands = s.cands.map((c) => {
    const p = got.get(c.h);
    return p ? { ...c, fol: p.fol ?? c.fol, medv: p.medv ?? null, er: p.er ?? null, link: p.url || c.link, read: true } : want.includes(c.h) ? { ...c, read: true, unread: true } : c;
  });
  await saveSearches(list.map((x) => (x.id === id ? s : x)));
  return s;
}
