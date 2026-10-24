// Warm-up — giro notturno dei numeri pubblici (fase 1, 22/10/2026). Logica in warmup-metrics-core.js.
//
// Una volta al giorno dal dispatcher (o «Aggiorna adesso» da un admin): legge con Apify i profili
// pubblici di tutti i profili del warm-up non archiviati e salva una lettura per profilo.
// Pochi profili → run sincroni (decine di secondi); il costo è limitato su ogni run.
//
// Chiavi:  warmup:pub:{id}   storico pubblico del profilo (vedi core)
//          warmup:pub:run    esito dell'ultimo giro (giorno, quanti letti, errori, costo stimato)
import { kv } from "@vercel/kv";
import { loadAll as loadSupervisor } from "@/lib/supervisor-store";
import { lastWeeks } from "@/lib/warmup-plan";
import { parseInstagram, parseX, mergeReading, weeklyFromStore, reachCheck, handleOf, romeDay, runBudget, PRICE, effectiveLink, linkStatsSQL, mergeLinkRows } from "@/lib/warmup-metrics-core";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";

const API = "https://api.apify.com/v2";
const RUN = "warmup:pub:run";
const PUB = (id) => `warmup:pub:${id}`;
const IG_ACTOR = "apify~instagram-profile-scraper";
const X_PROFILE_ACTOR = "danek~twitter-profile-ppr";
const X_POSTS_ACTOR = "apidojo~twitter-profile-scraper";

export const apifyConfigured = () => Boolean(process.env.APIFY_TOKEN);

async function runSync(actor, input, { maxUsd, timeout = 240 }) {
  const url = `${API}/acts/${actor}/run-sync-get-dataset-items?timeout=${timeout}&maxTotalChargeUsd=${maxUsd}&token=${encodeURIComponent(process.env.APIFY_TOKEN)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" });
  const text = await r.text();
  if (!r.ok) throw new Error(`${actor} ${r.status}: ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : [];
}

/** I profili da leggere: non archiviati, con un nome utente valido in Account social. */
async function targets() {
  const ids = (await kv.smembers("warmup:index")) || [];
  if (!ids.length) return [];
  const [recs, sup] = await Promise.all([kv.mget(...ids.map((id) => `warmup:p:${id}`)), loadSupervisor()]);
  const acc = new Map(sup.accounts.map((a) => [a.id, a]));
  return ids.map((id, i) => ({ id, rec: recs[i], acc: acc.get(id) }))
    .filter((x) => x.rec && !x.rec.archived && x.acc)
    .map((x) => ({ id: x.id, rec: x.rec, platform: x.rec.platform === "x" ? "x" : "ig", handle: handleOf(x.acc.username) }));
}

/** Un giro. Senza `force` legge al massimo una volta al giorno (giorno di Roma). */
export async function refreshPublicMetrics({ force = false } = {}) {
  if (!apifyConfigured()) return { skip: "no-apify-token" };
  const st = (await kv.get(RUN)) || {};
  const today = romeDay(Date.now());
  if (!force && st.lastDay === today) return { idle: true, lastDay: today };
  if (st.runningSince && Date.now() - st.runningSince < 8 * 60000) return { busy: true };
  await kv.set(RUN, { ...st, runningSince: Date.now() });
  const errors = [];
  try {
    const all = await targets();
    const list = all.filter((x) => x.handle);
    const ig = list.filter((x) => x.platform === "ig"), xs = list.filter((x) => x.platform === "x");
    const at = Date.now();
    const [igRows, xProfiles, xPosts] = await Promise.all([
      ig.length ? runSync(IG_ACTOR, { usernames: ig.map((x) => x.handle) }, { maxUsd: runBudget(ig.length, 0) }).catch((e) => { errors.push(e.message); return null; }) : [],
      xs.length ? runSync(X_PROFILE_ACTOR, { usernames: xs.map((x) => x.handle) }, { maxUsd: runBudget(0, xs.length) }).catch((e) => { errors.push(e.message); return null; }) : [],
      xs.length ? runSync(X_POSTS_ACTOR, { twitterHandles: xs.map((x) => x.handle), maxItems: 40 * xs.length, getAboutData: false }, { maxUsd: runBudget(0, xs.length) }).catch((e) => { errors.push(e.message); return null; }) : [],
    ]);
    const key = (h) => String(h || "").toLowerCase();
    const igBy = new Map((igRows || []).map((r) => [key(r.username || r.inputUrl?.split("/").filter(Boolean).pop()), r]));
    const xBy = new Map((xProfiles || []).map((r) => [key(r.profile), r]));
    const tweetsBy = new Map();
    for (const t of xPosts || []) { const h = key(t.author?.userName); if (!h) continue; if (!tweetsBy.has(h)) tweetsBy.set(h, []); tweetsBy.get(h).push(t); }
    let read = 0, notFound = 0;
    for (const t of list) {
      let reading = null;
      if (t.platform === "ig" && igRows) reading = parseInstagram(igBy.get(key(t.handle)), at);
      if (t.platform === "x" && xProfiles) reading = parseX(xBy.get(key(t.handle)), tweetsBy.get(key(t.handle)) || [], at);
      if (!reading) continue;
      const merged = mergeReading(await kv.get(PUB(t.id)), reading);
      await kv.set(PUB(t.id), merged);
      read++; if (reading.notFound) notFound++;
    }
    // tracking link OnlyFans di ogni account: clic, iscritti e ricavo dal magazzino dati (links_stats)
    let links = 0;
    if (bigQueryConfigured()) {
      const want = [];
      for (const t of all) { const s0 = await kv.get(PUB(t.id)); const l = effectiveLink(t.rec, s0?.last); if (l) want.push({ id: t.id, ...l, store: s0 }); }
      const sql = linkStatsSQL(want.map((w) => w.url), { dataset: process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213", orgId: HOC_ORGANIZATION_ID });
      if (sql) {
        try {
          const { rows } = await bqQuery(sql, { maxBytesBilled: 2 * 1024 ** 3, timeoutMs: 30_000 });
          for (const w of want) { await kv.set(PUB(w.id), mergeLinkRows(w.store, w.url, rows, w.from)); links++; }
        } catch (e) { errors.push("link OnlyFans: " + (e.message || e)); }
      }
    }
    const estUsd = Math.round((ig.length * PRICE.ig + xs.length * (PRICE.xProfile + PRICE.xPosts)) * 1000) / 1000;
    const done = { lastDay: today, lastAt: Date.now(), profiles: list.length, read, notFound, links, estUsd, errors: errors.slice(0, 5), runningSince: null };
    await kv.set(RUN, done);
    return done;
  } catch (e) {
    await kv.set(RUN, { ...st, runningSince: null, errors: [e.message], lastErrorAt: Date.now() });
    throw e;
  }
}

export async function getRunState() {
  return (await kv.get(RUN)) || null;
}

/** Riassunto per la pagina: ultima lettura, follower degli ultimi giorni, settimane già calcolate. */
export async function loadPublicSummaries(ids, platforms = {}) {
  if (!ids.length) return {};
  const stores = await kv.mget(...ids.map(PUB));
  const weeks = lastWeeks(13).map((w) => w.key);
  const out = {};
  ids.forEach((id, i) => {
    const s = stores[i];
    if (!s) return;
    const days = Object.keys(s.days || {}).sort().slice(-15);
    out[id] = {
      lastAt: s.lastAt || null,
      last: s.last || null,
      days: Object.fromEntries(days.map((d) => [d, s.days[d]])),
      weekly: weeklyFromStore(s, weeks),
      reach: reachCheck(s, platforms[id] || "ig"),
      link: s.link ? { url: s.link.url, from: s.link.from, name: s.link.name || null, created: s.link.created || null, total: s.link.total || null, lastDay: s.link.lastDay || null, missing: Boolean(s.link.missing) } : null,
    };
  });
  return out;
}
