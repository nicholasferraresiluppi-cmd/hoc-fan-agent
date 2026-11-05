// Bilancio del mese — dati (16/10/2026). Il foglio "Bilancio_unico_LIVE" in HOC Pro: venduto
// giorno per giorno di tutte le creator dello split, goal, AM/SM, ecosistemi. Conti in bilancio-core.js.
//
// Fonti:
//   creator    = lo split (getLiveCreators: le stesse di Revenue e chat; si aggiungono da /admin/creator-split)
//   venduto    = onlyfans.attributed_transactions (net), una sola query per tutte le pagine e per mese
//   goal       = revenue:goals:{slug} — GLI STESSI di Revenue e chat: un goal per creator×paese×mese,
//                chi lo cambia qui lo cambia anche lì (prima c'erano due numeri: foglio e app)
//   AM / SM    = bilancio:people (scritti a mano dagli admin, come nel foglio)
//   ecosistemi = bilancio:groups (gruppi di creator che condividono le persone, decisi dagli admin)
//
// Costo: ~0,1-0,3 GB a ricalcolo. Mese in corso: cache KV 10 minuti, single-flight.
// Mesi chiusi: cache 24 ore (il dato non si muove più, salvo rimborsi tardivi).
import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured } from "@/lib/bigquery-api";
import { getLiveCreators } from "@/lib/live-creators-store";
import { getGoals } from "@/lib/revenue-pacing";
import { buildBilancio, calendarOf, cleanPerson, cleanGroups, clampDay } from "@/lib/bilancio-core";

export { bigQueryConfigured };

const P = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const CACHE_KEY = (month, ids) => `bilancio:sales:v2:${month}:${ids}`;
const LOCK_KEY = (month) => `bilancio:sales:lock:${month}`;
const PEOPLE_KEY = "bilancio:people";
const GROUPS_KEY = "bilancio:groups";
const FRESH_MS = 10 * 60 * 1000;
const CLOSED_FRESH_MS = 24 * 3600 * 1000;

export const todayUTC = () => new Date().toISOString().slice(0, 10);
const lastDayOf = (month) => { const [y, m] = month.split("-").map(Number); return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };

async function computeSales(ids, month, today) {
  const { prevMonth } = calendarOf(`${month}-01`);
  const end = lastDayOf(month) < today ? lastDayOf(month) : today;
  const IDS = ids.map(Number).filter((x) => Number.isInteger(x) && x > 0).join(", ");
  const { rows, totalBytesProcessed } = await bqQuery(`
    SELECT creator_id, CAST(DATE(created_at) AS STRING) AS date, ROUND(SUM(net), 2) AS net
    FROM \`${P()}.onlyfans.attributed_transactions\`
    WHERE creator_id IN (${IDS})
      AND DATE(created_at) >= DATE '${prevMonth}-01'
      AND DATE(created_at) <= DATE '${end}'
    GROUP BY 1, 2`, { maxBytesBilled: 5 * 1024 ** 3, timeoutMs: 40_000 });
  const daily = [], prevTotals = {};
  // mese prima anche giorno per giorno (26/10/2026, grafico dello stile vetro): righe già lette, niente query in più
  const prevDaily = new Array(31).fill(0);
  for (const r of rows) {
    const id = Number(r.creator_id), net = Number(r.net) || 0;
    if (r.date.startsWith(month)) daily.push({ creator_id: id, date: r.date, net });
    else if (r.date.startsWith(prevMonth)) {
      prevTotals[id] = (prevTotals[id] || 0) + net;
      prevDaily[Number(r.date.slice(8, 10)) - 1] += net;
    }
  }
  return { daily, prevTotals, prevDaily: prevDaily.map((v) => Math.round(v)), today, month, bytes: totalBytesProcessed, updated_at: new Date().toISOString() };
}

async function getSales(ids, month, { force = false } = {}) {
  const today = todayUTC();
  const closedMonth = lastDayOf(month) < today;
  const ck = CACHE_KEY(month, ids.join(","));
  const cached = await kv.get(ck).catch(() => null);
  const age = cached ? Date.now() - new Date(cached.updated_at).getTime() : Infinity;
  const fresh = cached && (closedMonth ? age < CLOSED_FRESH_MS : cached.today === today && age < FRESH_MS);
  if (fresh && !force) return cached;

  const gotLock = await kv.set(LOCK_KEY(month), Date.now(), { nx: true, ex: 60 }).catch(() => "OK");
  if (!gotLock) {
    // Qualcun altro sta ricalcolando: meglio il dato di pochi minuti fa che una seconda query.
    if (cached && (closedMonth || cached.today === today)) return { ...cached, refreshing: true };
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const c = await kv.get(ck).catch(() => null);
      if (c && c.updated_at !== cached?.updated_at) return c;
    }
    throw new Error("Calcolo già in corso — riprova tra qualche secondo");
  }
  try {
    const out = await computeSales(ids, month, today);
    await kv.set(ck, out, { ex: closedMonth ? 3 * 24 * 3600 : 2 * 24 * 3600 });
    return out;
  } finally {
    await kv.del(LOCK_KEY(month)).catch(() => {});
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

export async function getGroups() {
  const g = await kv.get(GROUPS_KEY).catch(() => null);
  return Array.isArray(g?.groups) ? g.groups : [];
}

/** Sostituisce gli ecosistemi (solo creator dello split; una creator in un solo gruppo). */
export async function setGroups(raw, by) {
  const known = new Set((await getLiveCreators()).map((c) => c.slug));
  const groups = cleanGroups(raw, known);
  await kv.set(GROUPS_KEY, { groups, updated_at: new Date().toISOString(), by: String(by || "").slice(0, 80) });
  return groups;
}

/** Il bilancio al giorno scelto (default oggi). */
export async function getBilancio({ date, force = false } = {}) {
  const today = todayUTC();
  const asOf = clampDay(date, today);
  const { month } = calendarOf(asOf);
  const creators = await getLiveCreators();
  const ids = [...new Set(creators.flatMap((c) => c.accounts.map((a) => Number(a.creator_id))))].sort((a, b) => a - b);
  if (!ids.length) throw new Error("Nessuna creator nello split");
  const [sales, people, groups, goalsList] = await Promise.all([
    getSales(ids, month, { force }),
    getPeople(),
    getGroups(),
    Promise.all(creators.map((c) => getGoals(c).then((g) => [c.slug, g.goals || {}]))),
  ]);
  const out = buildBilancio({
    creators, daily: sales.daily, prevTotals: sales.prevTotals,
    goals: Object.fromEntries(goalsList), people, groups, today, asOf,
  });
  // prevDaily manca nelle cache scritte prima del 26/10: il grafico allora mostra solo il mese in corso
  return { ...out, prevDaily: sales.prevDaily || null, updated_at: sales.updated_at, refreshing: Boolean(sales.refreshing), groupsDef: groups, allCreators: creators.map((c) => ({ slug: c.slug, name: c.name })) };
}
