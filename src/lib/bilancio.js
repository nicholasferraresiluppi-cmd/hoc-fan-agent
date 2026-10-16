// Bilancio del mese — dati (16/10/2026). Il foglio "Bilancio_unico_LIVE" in HOC Pro: venduto
// giorno per giorno di tutte le creator dello split, goal, AM/SM, proiezione. Conti in bilancio-core.js.
//
// Fonti:
//   creator  = lo split (getLiveCreators: le stesse di Revenue e chat; si aggiungono da /admin/creator-split)
//   venduto  = onlyfans.attributed_transactions (net), una sola query per tutte le pagine
//   goal     = revenue:goals:{slug} — GLI STESSI di Revenue e chat: un goal per creator×paese×mese,
//              chi lo cambia qui lo cambia anche lì (prima c'erano due numeri: foglio e app)
//   AM / SM  = bilancio:people (scritti a mano dagli admin, come nel foglio)
//
// Costo: ~0,1-0,3 GB a ricalcolo. Cache KV 10 minuti, single-flight.
import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured } from "@/lib/bigquery-api";
import { getLiveCreators } from "@/lib/live-creators-store";
import { getGoals } from "@/lib/revenue-pacing";
import { buildBilancio, calendarOf, cleanPerson } from "@/lib/bilancio-core";

export { bigQueryConfigured };

const P = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const CACHE_KEY = (ids) => `bilancio:sales:v1:${ids}`;
const LOCK_KEY = "bilancio:sales:lock";
const PEOPLE_KEY = "bilancio:people";
const FRESH_MS = 10 * 60 * 1000;

const todayUTC = () => new Date().toISOString().slice(0, 10);

async function computeSales(ids, today) {
  const { month, prevMonth } = calendarOf(today);
  const IDS = ids.map(Number).filter((x) => Number.isInteger(x) && x > 0).join(", ");
  const { rows, totalBytesProcessed } = await bqQuery(`
    SELECT creator_id, CAST(DATE(created_at) AS STRING) AS date, ROUND(SUM(net), 2) AS net
    FROM \`${P()}.onlyfans.attributed_transactions\`
    WHERE creator_id IN (${IDS})
      AND DATE(created_at) >= DATE '${prevMonth}-01'
      AND DATE(created_at) <= DATE '${today}'
    GROUP BY 1, 2`, { maxBytesBilled: 5 * 1024 ** 3, timeoutMs: 40_000 });
  const daily = [], prevTotals = {};
  for (const r of rows) {
    const id = Number(r.creator_id), net = Number(r.net) || 0;
    if (r.date.startsWith(month)) daily.push({ creator_id: id, date: r.date, net });
    else if (r.date.startsWith(prevMonth)) prevTotals[id] = (prevTotals[id] || 0) + net;
  }
  return { daily, prevTotals, today, bytes: totalBytesProcessed, updated_at: new Date().toISOString() };
}

async function getSales(ids, { force = false } = {}) {
  const today = todayUTC();
  const ck = CACHE_KEY(ids.join(","));
  const cached = await kv.get(ck).catch(() => null);
  const fresh = cached && cached.today === today && Date.now() - new Date(cached.updated_at).getTime() < FRESH_MS;
  if (fresh && !force) return cached;

  const gotLock = await kv.set(LOCK_KEY, Date.now(), { nx: true, ex: 60 }).catch(() => "OK");
  if (!gotLock) {
    // Qualcun altro sta ricalcolando: meglio il dato di pochi minuti fa che una seconda query.
    if (cached && cached.today === today) return { ...cached, refreshing: true };
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const c = await kv.get(ck).catch(() => null);
      if (c && c.today === today && c.updated_at !== cached?.updated_at) return c;
    }
    throw new Error("Calcolo già in corso — riprova tra qualche secondo");
  }
  try {
    const out = await computeSales(ids, today);
    await kv.set(ck, out, { ex: 2 * 24 * 3600 });
    return out;
  } finally {
    await kv.del(LOCK_KEY).catch(() => {});
  }
}

export async function getPeople() {
  return (await kv.get(PEOPLE_KEY).catch(() => null)) || {};
}

/** Imposta AM/SM di un account. creator = oggetto dello split (slug + accounts). */
export async function setPerson(creator, { country, am, sm }, by) {
  if (!creator.accounts.some((a) => a.country === country)) throw new Error("Paese non valido");
  const cur = await getPeople();
  const next = { ...cur, [creator.slug]: { ...(cur[creator.slug] || {}) } };
  const prev = next[creator.slug][country] || {};
  next[creator.slug][country] = {
    am: am === undefined ? prev.am || null : cleanPerson(am),
    sm: sm === undefined ? prev.sm || null : cleanPerson(sm),
    updated_at: new Date().toISOString(), by: String(by || "").slice(0, 80),
  };
  await kv.set(PEOPLE_KEY, next);
  return next;
}

/** Il bilancio completo del mese in corso. */
export async function getBilancio({ force = false } = {}) {
  const creators = await getLiveCreators();
  const ids = [...new Set(creators.flatMap((c) => c.accounts.map((a) => Number(a.creator_id))))].sort((a, b) => a - b);
  if (!ids.length) throw new Error("Nessuna creator nello split");
  const [sales, people, goalsList] = await Promise.all([
    getSales(ids, { force }),
    getPeople(),
    Promise.all(creators.map((c) => getGoals(c).then((g) => [c.slug, g.goals || {}]))),
  ]);
  const out = buildBilancio({
    creators, daily: sales.daily, prevTotals: sales.prevTotals,
    goals: Object.fromEntries(goalsList), people, today: sales.today,
  });
  return { ...out, updated_at: sales.updated_at, refreshing: Boolean(sales.refreshing) };
}
