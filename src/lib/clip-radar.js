// Radar del clipping — archivio e letture Apify (29/10/2026). Logica pura in clip-radar-core.js.
//
// Il publisher aggiunge i profili Instagram/TikTok da tenere d'occhio (pagine di clipping, creator
// che fanno numeri); ogni notte si leggono i loro ultimi video pubblici e la pagina mostra quelli
// usciti dal solito. Si legge solo il pubblico, senza accedere ad alcun account.
//
// Chiavi:  clipradar:profiles      HASH id → profilo { id, platform, handle, label, note, addedAt, addedBy, lastRead, error }
//          clipradar:v:{id}        video del profilo (array, vedi mergeVideos)
//          clipradar:saved         HASH videoId → { at, by, note } (le idee salvate dal publisher)
//          clipradar:run           esito dell'ultimo giro (giorno di Roma, letti, errori, costo stimato)
//          clipradar:spend:{YYYY-MM}  spesa stimata del mese (tetto CLIP_RADAR_CAP_USD, def. 40 $)
import { kv } from "@vercel/kv";
import { loadAll as loadSupervisor } from "@/lib/supervisor-store";
import {
  profileId, normalizeIg, normalizeTt, mergeVideos, runBudget, MAX_PROFILES, PER_PROFILE, PRICE,
} from "@/lib/clip-radar-core";

const API = "https://api.apify.com/v2";
const IG_ACTOR = "apify~instagram-reel-scraper";
const TT_ACTOR = "clockworks~tiktok-profile-scraper";
const P = "clipradar:profiles";
const V = (id) => `clipradar:v:${id}`;
const SAVED = "clipradar:saved";
const RUN = "clipradar:run";
const SPEND = (m) => `clipradar:spend:${m}`;
const LOOKBACK_DAYS = 30;

export const apifyConfigured = () => Boolean(process.env.APIFY_TOKEN);
const capUsd = () => Number(process.env.CLIP_RADAR_CAP_USD) || 40;
const romeDay = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
const month = (ts) => romeDay(ts).slice(0, 7);
const since = () => new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);

async function runSync(actor, input, { maxUsd, timeout = 280 }) {
  const url = `${API}/acts/${actor}/run-sync-get-dataset-items?timeout=${timeout}&maxTotalChargeUsd=${maxUsd}&token=${encodeURIComponent(process.env.APIFY_TOKEN)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" });
  const text = await r.text();
  if (!r.ok) throw new Error(`${actor.split("~")[1]} ${r.status}: ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : [];
}

export async function listProfiles() {
  const h = (await kv.hgetall(P)) || {};
  return Object.values(h).map((p) => (typeof p === "string" ? JSON.parse(p) : p)).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

export async function loadAll() {
  const profiles = await listProfiles();
  const vids = profiles.length ? await kv.mget(...profiles.map((p) => V(p.id))) : [];
  const videosByProfile = Object.fromEntries(profiles.map((p, i) => [p.id, vids[i] || []]));
  const savedRaw = (await kv.hgetall(SAVED)) || {};
  const saved = Object.fromEntries(Object.entries(savedRaw).map(([k, v]) => [k, typeof v === "string" ? JSON.parse(v) : v]));
  const [run, spent] = await Promise.all([kv.get(RUN), kv.get(SPEND(month(Date.now())))]);
  return { profiles, videosByProfile, saved, run: run || null, spent: Number(spent) || 0, cap: capUsd() };
}

/**
 * I NOSTRI profili (Account social: Instagram e TikTok non ritirati) entrano nel radar da soli
 * (29/10, Nicholas): così si confrontano anche i nostri video con quelli che funzionano fuori.
 * `ours: true`, non contano nel tetto e non si tolgono da qui (si ritirano in Account social).
 * Ritorna i profili nuovi da leggere.
 */
export async function syncOurProfiles() {
  const sup = await loadSupervisor();
  const want = new Map();
  for (const a of sup.accounts || []) {
    if (a.retired || (a.platform !== "instagram" && a.platform !== "tiktok")) continue;
    const h = String(a.username || "").trim().replace(/^@+/, "").toLowerCase();
    if (!/^[\w.]{2,40}$/.test(h)) continue;
    const platform = a.platform === "tiktok" ? "tt" : "ig";
    want.set(profileId(platform, h), { platform, handle: h, creator: a.creator || null });
  }
  const cur = new Map((await listProfiles()).map((p) => [p.id, p]));
  const added = [];
  for (const [id, w] of want) {
    const ex = cur.get(id);
    if (ex) { if (!ex.ours || ex.creator !== w.creator) await kv.hset(P, { [id]: JSON.stringify({ ...ex, ours: true, creator: w.creator }) }); continue; }
    const prof = { id, ...w, ours: true, label: null, note: "", addedAt: Date.now(), addedBy: "Account social", lastRead: null, error: null, reading: Date.now() };
    await kv.hset(P, { [id]: JSON.stringify(prof) });
    added.push(prof);
  }
  // un nostro account ritirato o tolto esce anche da qui
  for (const [id, p] of cur) if (p.ours && !want.has(id)) await removeProfile(id);
  return added;
}

export async function addProfile({ platform, handle }, by) {
  const id = profileId(platform, handle);
  const all = await listProfiles();
  if (all.some((p) => p.id === id)) return { id, exists: true };
  if (all.filter((p) => !p.ours).length >= MAX_PROFILES) throw new Error(`Al massimo ${MAX_PROFILES} profili: togline uno prima`);
  const prof = { id, platform, handle, label: null, note: "", addedAt: Date.now(), addedBy: by?.name || null, lastRead: null, error: null, reading: Date.now() };
  await kv.hset(P, { [id]: JSON.stringify(prof) });
  return { id, prof };
}

export async function updateProfile(id, patch) {
  const raw = await kv.hget(P, id);
  if (!raw) throw new Error("Profilo non trovato");
  const cur = typeof raw === "string" ? JSON.parse(raw) : raw;
  const next = { ...cur, ...patch };
  await kv.hset(P, { [id]: JSON.stringify(next) });
  return next;
}

export async function removeProfile(id) {
  await Promise.all([kv.hdel(P, id), kv.del(V(id))]);
}

export async function toggleSaved(videoId, on, by, note = "") {
  if (on) await kv.hset(SAVED, { [videoId]: JSON.stringify({ at: Date.now(), by: by?.name || null, note: String(note || "").slice(0, 300) }) });
  else await kv.hdel(SAVED, videoId);
}

/**
 * Legge i profili indicati (o tutti) e aggiorna l'archivio. Un run Apify per piattaforma, con
 * tetto di spesa per run e per mese. Ritorna { read, videos, usd, errors }.
 */
export async function readProfiles(profiles) {
  if (!apifyConfigured()) return { skip: "no-apify-token" };
  const m = month(Date.now());
  const spent = Number(await kv.get(SPEND(m))) || 0;
  const ig = profiles.filter((p) => p.platform === "ig"), tt = profiles.filter((p) => p.platform === "tt");
  const planned = runBudget(ig.length, "ig") + runBudget(tt.length, "tt");
  if (spent + planned > capUsd()) return { skip: "cap", spent, planned, cap: capUsd() };
  const errors = [];
  const [igRows, ttRows] = await Promise.all([
    ig.length ? runSync(IG_ACTOR, { username: ig.map((p) => p.handle), resultsLimit: PER_PROFILE, onlyPostsNewerThan: since(), skipPinnedPosts: true }, { maxUsd: runBudget(ig.length, "ig") }).catch((e) => { errors.push(e.message); return null; }) : [],
    tt.length ? runSync(TT_ACTOR, { profiles: tt.map((p) => p.handle), resultsPerPage: PER_PROFILE, profileSorting: "latest", oldestPostDateUnified: since(), excludePinnedPosts: true, shouldDownloadVideos: false, shouldDownloadCovers: false }, { maxUsd: runBudget(tt.length, "tt") }).catch((e) => { errors.push(e.message); return null; }) : [],
  ]);
  const usd = Math.round((((igRows?.length || 0) * PRICE.ig + (ttRows?.length || 0) * PRICE.tt) + (ig.length ? 0.001 : 0) + (tt.length ? 0.001 : 0)) * 1000) / 1000;
  if (usd) await kv.incrbyfloat(SPEND(m), usd).then(() => kv.expire(SPEND(m), 120 * 86400)).catch(() => {});
  const at = Date.now();
  const byOwner = new Map();
  for (const row of igRows || []) { const v = normalizeIg(row); if (v?.owner) (byOwner.get(`ig:${v.owner}`) || byOwner.set(`ig:${v.owner}`, []).get(`ig:${v.owner}`)).push(v); }
  for (const row of ttRows || []) { const v = normalizeTt(row); if (v?.owner) (byOwner.get(`tt:${v.owner}`) || byOwner.set(`tt:${v.owner}`, []).get(`tt:${v.owner}`)).push(v); }
  let read = 0, videos = 0;
  for (const p of profiles) {
    const failed = (p.platform === "ig" ? igRows : ttRows) == null;
    const fresh = byOwner.get(p.id) || [];
    if (failed) { await updateProfile(p.id, { reading: null, error: "Lettura non riuscita: si riprova stanotte" }).catch(() => {}); continue; }
    const merged = mergeVideos((await kv.get(V(p.id))) || [], fresh, at);
    await kv.set(V(p.id), merged);
    await updateProfile(p.id, { reading: null, lastRead: at, error: fresh.length ? null : "Nessun video negli ultimi 30 giorni: profilo privato, chiuso, rinominato o fermo — controlla che il nome sia giusto" }).catch(() => {});
    read++; videos += fresh.length;
  }
  return { read, videos, usd, errors };
}

/** Giro notturno: tutti i profili, al massimo una volta al giorno (giorno di Roma). */
export async function nightlyRefresh({ force = false } = {}) {
  if (!apifyConfigured()) return { skip: "no-apify-token" };
  const today = romeDay(Date.now());
  const st = (await kv.get(RUN)) || {};
  if (!force && st.lastDay === today) return { idle: true };
  if (st.runningSince && Date.now() - st.runningSince < 8 * 60000) return { busy: true };
  await syncOurProfiles().catch(() => {});
  const profiles = await listProfiles();
  if (!profiles.length) { await kv.set(RUN, { lastDay: today, at: Date.now(), read: 0 }); return { read: 0 }; }
  await kv.set(RUN, { ...st, runningSince: Date.now() });
  let res;
  try { res = await readProfiles(profiles); }
  catch (e) { res = { errors: [e?.message || "errore"] }; }
  await kv.set(RUN, { lastDay: res.skip === "cap" ? st.lastDay : today, at: Date.now(), ...res, runningSince: null });
  return res;
}

/** Il video originale di un post, a pezzi (Range) — per «Scarica». null se non c'è o il link è scaduto. */
const CHUNK = 3 * 1024 * 1024;
export async function videoChunk(pid, videoId, rangeHeader) {
  const vids = (await kv.get(V(pid))) || [];
  const v = vids.find((x) => x.id === videoId);
  if (!v?.video) return null;
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || "");
  const start = m && m[1] ? Number(m[1]) : 0;
  const end = start + CHUNK - 1;
  const r = await fetch(v.video, { headers: { Range: `bytes=${start}-${end}` }, cache: "no-store" });
  if (!r.ok && r.status !== 206) return { expired: true };
  return { status: r.status, body: r.body, type: r.headers.get("content-type") || "video/mp4", range: r.headers.get("content-range"), len: r.headers.get("content-length"), name: `${v.owner || "video"}-${videoId.split(":")[1]}` };
}
