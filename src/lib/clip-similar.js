// Profili simili alle pagine del Radar (4/11/2026). Logica pura in clip-trends-core.js (similarList).
//
// Per ogni pagina Instagram del Radar (non le nostre) si leggono i profili che Instagram suggerisce come
// simili, una volta a settimana. Il run Apify dura circa un minuto a pagina: si AVVIA e si RACCOGLIE
// dopo (all'apertura della scheda Trend o al giro notturno), come le ricerche dei Trend.
//
// Chiavi:  clipradar:similar:job   il giro in corso { startedAt, by, seeds, run }
//          clipradar:similar:last  l'ultimo giro raccolto { at, seeds, list, usd, error }
// La spesa va nello stesso tetto mensile del Radar (clipradar:spend:{YYYY-MM}).
import { kv } from "@vercel/kv";
import { apifyConfigured, capUsd, spentThisMonth, addSpend, listProfiles } from "@/lib/clip-radar";
import { SIMILAR_PER_SEED, SIMILAR_PRICE, similarBudget, similarDue, similarList, pickSeeds } from "@/lib/clip-trends-core";

const API = "https://api.apify.com/v2";
const ACTOR = "memo23~instagram-similar-profiles-scraper";
const JOB = "clipradar:similar:job";
const LAST = "clipradar:similar:last";
const JOB_MAX_MS = 45 * 60_000;
const FIELDS = "username,sourceUsername,matchedSeeds,seedOverlap,followerCount,fullName,biography,profilePicUrl,isPrivate,isVerified,category";
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);

async function apify(path, init) {
  const r = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(process.env.APIFY_TOKEN)}`, { cache: "no-store", ...init });
  const text = await r.text();
  if (!r.ok) throw new Error(`Apify ${r.status}: ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

// le pagine di partenza: quelle segnate (o tutte le Instagram non nostre, se nessuna è segnata)
const seedsOf = pickSeeds;

/** Avvia il giro (se è il momento, o `force`). Ritorna { started } | { busy } | { idle } | { skip }. */
export async function startSimilar({ force = false, by = null } = {}) {
  if (!apifyConfigured()) return { skip: "no-apify-token" };
  const job = parse(await kv.get(JOB));
  if (job && Date.now() - job.startedAt < JOB_MAX_MS) return { busy: true };
  if (!force && !similarDue(parse(await kv.get(LAST)), Date.now())) return { idle: true };
  const seeds = seedsOf(await listProfiles());
  if (!seeds.length) return { skip: "no-seeds" };
  const planned = similarBudget(seeds.length);
  if ((await spentThisMonth()) + planned > capUsd()) return { skip: "cap", planned, cap: capUsd() };
  const d = await apify(`/acts/${ACTOR}/runs?timeout=2400&maxTotalChargeUsd=${planned}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: seeds.map((s) => s.handle), maxSimilarPerAccount: SIMILAR_PER_SEED, minSeedOverlap: 1, enrichProfiles: true, excludePrivate: true, depth: 1 }),
  });
  await kv.set(JOB, { startedAt: Date.now(), by: by?.name || null, seeds, run: { id: d.data.id, ds: d.data.defaultDatasetId } });
  return { started: true, planned };
}

/** Se il run è finito, raccoglie e salva la lista. Ritorna { collected } | { pending } | { none }. */
export async function collectSimilar() {
  const job = parse(await kv.get(JOB));
  if (!job) return { none: true };
  if (!(await kv.set(`${JOB}:lock`, 1, { nx: true, ex: 120 }))) return { pending: true };
  try {
    const st = await apify(`/actor-runs/${job.run.id}`);
    const status = st?.data?.status;
    const late = Date.now() - job.startedAt > JOB_MAX_MS;
    if ((status === "READY" || status === "RUNNING") && !late) return { pending: true };
    // anche un giro finito male (tetto, tempo) ha i risultati raccolti fin lì
    const rows = await apify(`/datasets/${job.run.ds}/items?clean=true&fields=${FIELDS}&limit=3000`).catch(() => []);
    const items = Array.isArray(rows) ? rows : [];
    const usd = Math.round(items.length * SIMILAR_PRICE * 1000) / 1000;
    await addSpend(usd);
    const known = (await listProfiles().catch(() => [])).map((p) => p.id);
    const list = similarList(items, job.seeds, known);
    const error = status === "SUCCEEDED" ? null : late && status === "RUNNING" ? "non ha finito in tempo" : `ricerca ${String(status || "non riuscita").toLowerCase()}`;
    await kv.set(LAST, { at: Date.now(), startedAt: job.startedAt, by: job.by, seeds: job.seeds.map((s) => s.handle), found: items.length, list, usd, error });
    await kv.del(JOB);
    return { collected: true, found: items.length, usd };
  } finally {
    await kv.del(`${JOB}:lock`).catch(() => {});
  }
}

/** Giro notturno: raccoglie quello avviato, poi ne avvia uno nuovo una volta a settimana. */
export async function weeklySimilar() {
  if (!apifyConfigured()) return { skip: "no-apify-token" };
  const c = await collectSimilar();
  const s = c.pending ? { busy: true } : await startSimilar();
  return { collect: c, start: s };
}

export async function loadSimilar() {
  const [last, job, profiles] = await Promise.all([kv.get(LAST), kv.get(JOB), listProfiles().catch(() => [])]);
  const l = parse(last) || null;
  const j = parse(job);
  // chi nel frattempo è entrato nel Radar non si propone più
  const inRadar = new Set(profiles.map((p) => p.id));
  if (l?.list) l.list = l.list.filter((c) => !inRadar.has(c.id));
  const pages = profiles.filter((p) => p.platform === "ig" && !p.ours).map((p) => ({ id: p.id, handle: p.handle, seed: Boolean(p.similarSeed) }));
  return { last: l, running: j ? { startedAt: j.startedAt, by: j.by } : null, budget: similarBudget(seedsOf(profiles).length), pages, chosen: pages.some((p) => p.seed) };
}
