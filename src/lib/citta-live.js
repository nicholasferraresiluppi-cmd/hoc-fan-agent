// La città, dati vivi (26/09/2026): i piani Sales, Finance e Chatting e l'altezza dei palazzi
// vengono dagli STESSI calcoli delle pagine di HOC Pro (P&L live, Classifica vendite / Action
// Center), non da ClickUp. HR, Deal e Contenuti restano la stima dai titoli ClickUp.
//
//   Sales    — venduto e venduto per turno dalla matrice della pagina Creator (turni a quota, solo turni iniziati);
//              calo per turno ≥ 15% sul mese prima = ambra (stessa soglia "In calo")
//   Finance  — costo operatori sul venduto vs mediana delle creator: ≥ +4 punti = ambra ("Costo alto" del P&L)
//   Chatting — operatori sotto soglia (score ≤ 25, ≥ 5 turni: "Da rivedere") tra chi lavora soprattutto qui
//
// Cache KV 1h: il calcolo legge due mesi di wage e costruisce la classifica, non va rifatto a ogni apertura.
import { kv } from "@vercel/kv";
import { getWages } from "@/lib/cp-wages-store";
import { aggregateWagesByAlias } from "@/lib/pnl-aggregate";
import { buildCreatorMatrix } from "@/lib/creator-aggregates";
import { buildOperatorsForCpLeaderboard, hasCpDataForPeriod } from "@/lib/creatorspro-data";
import { buildCpLeaderboard } from "@/lib/creatorspro-score";
import { loadGroupCategories } from "@/app/api/admin/group-categories/route";
import { loadGroupLanguages } from "@/app/api/admin/group-languages/route";
import { detectLanguage } from "@/lib/leaderboard-calc";
import { MONTHS_IT } from "@/lib/format";

export const SALES_DROP = -0.15;
// pannello 26/09: +4 punti non scattava mai (range reale 9,8–13,9%): +1,5 punti sulla mediana
export const COST_HIGH_PTS = 0.015;
// Chatting grave solo se il problema è diffuso: ≥ 25% degli operatori sotto soglia o score medio < 35
export const CHAT_SHARE = 0.25;
export const CHAT_AVG_MIN = 35;
export const UNDER_SCORE = 25;
export const UNDER_MIN_SHIFTS = 5;
const TTL = 3600;

/** "Fishball - IT" → "Fishball"; "Cubanita" → "Cubanita". Una persona può avere più pagine (IT/EN). */
export const personOf = (alias) => String(alias || "").replace(/\s*-\s*[A-Z]{2}\s*$/, "").trim();

const monthOf = (d = new Date()) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${p.find((x) => x.type === "year").value}-${p.find((x) => x.type === "month").value}`;
};
const prevMonth = (pid) => { const [y, m] = pid.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

function byPerson(byAlias) {
  const out = {};
  for (const [alias, a] of byAlias.entries()) {
    const n = personOf(alias);
    if (!out[n]) out[n] = { sales: 0, cost: 0, shifts: 0 };
    out[n].sales += a.sales; out[n].cost += a.cost; out[n].shifts += a.shifts;
  }
  return out;
}
const median = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); if (!v.length) return null; const k = Math.floor(v.length / 2); return v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2; };

async function chattingBy(periodId) {
  // Chatting: stessa classifica (e stesse decorazioni) di Classifica vendite / alert "sotto soglia"
  const chat = {};
  if (!(await hasCpDataForPeriod(periodId))) return chat;
  const [opsRaw, categories, langs, excl] = await Promise.all([
    buildOperatorsForCpLeaderboard(periodId), loadGroupCategories(), loadGroupLanguages(), kv.get("leaderboard:exclusions"),
  ]);
  const exclusions = excl || {};
  const decorated = opsRaw.filter((op) => !exclusions[op.employee]).map((op) => {
    const lang = langs?.[op.group] || detectLanguage(op.group);
    return { ...op, category: categories?.[op.group] || null, language: lang || null };
  });
  const { ranking } = await buildCpLeaderboard(decorated, periodId);
  for (const r of ranking) {
    const n = personOf(r.cp_breakdown?.top_creator);
    if (!n || r.score == null) continue;
    if (!chat[n]) chat[n] = { ops: 0, under: 0, scoreSum: 0, names: [] };
    chat[n].ops += 1; chat[n].scoreSum += r.score;
    if (r.score > 0 && r.score <= UNDER_SCORE && (r.cp_aggregates?.total_shifts || 0) >= UNDER_MIN_SHIFTS) { chat[n].under += 1; chat[n].names.push(String(r.employee || "").split(" ").slice(0, 2).join(" ")); }
  }
  return chat;
}

export async function computeCityLive(periodId = monthOf()) {
  const prevId = prevMonth(periodId);
  const [wCur, wPrev, mCur, mPrev] = await Promise.all([getWages(periodId), getWages(prevId), buildCreatorMatrix(periodId), buildCreatorMatrix(prevId)]);
  // costo: P&L (takes × compenso del turno); venduto e turni: matrice di Creator (una sola definizione di turno per l'app)
  const aCur = aggregateWagesByAlias(wCur);
  const costBy = byPerson(aCur), costPrevBy = byPerson(aggregateWagesByAlias(wPrev));
  const fromMatrix = (m) => { const o = {}; for (const [alias, c] of Object.entries(m?.creators || {})) { const n = personOf(alias); if (!o[n]) o[n] = { sales: 0, shifts: 0, top: null, topSales: -1 }; o[n].sales += c.total_sales || 0; o[n].shifts += c.total_shifts || 0; if ((c.total_sales || 0) > o[n].topSales) { o[n].topSales = c.total_sales || 0; o[n].top = alias; } } return o; };
  const cur = fromMatrix(mCur), prev = fromMatrix(mPrev);
  for (const n of Object.keys(cur)) cur[n].cost = costBy[n] ? costBy[n].cost * (cur[n].sales / (costBy[n].sales || cur[n].sales || 1)) : 0;
  // mediana del costo sul venduto tra le creator (a livello di pagina, come il P&L)
  const medianCostPct = median([...aCur.values()].filter((a) => a.sales > 0).map((a) => a.cost / a.sales));

  const [chat, chatPrev] = await Promise.all([chattingBy(periodId), chattingBy(prevId)]);

  const people = {};
  for (const n of new Set([...Object.keys(cur), ...Object.keys(prev), ...Object.keys(chat)])) {
    const c = cur[n] || { sales: 0, cost: 0, shifts: 0 }, p = prev[n] || { sales: 0, cost: 0, shifts: 0 }, ch = chat[n];
    people[n] = {
      sales: Math.round(c.sales), shifts: c.shifts, perShift: c.shifts ? c.sales / c.shifts : null,
      salesPrev: Math.round(p.sales), perShiftPrev: p.shifts ? p.sales / p.shifts : null,
      costPct: c.sales > 0 ? c.cost / c.sales : null,
      costPctPrev: costPrevBy[n]?.sales > 0 ? costPrevBy[n].cost / costPrevBy[n].sales : null,
      underPrev: chatPrev[n]?.under ?? null, topAlias: c.top || null,
      ops: ch?.ops || 0, under: ch?.under || 0, avgScore: ch?.ops ? ch.scoreSum / ch.ops : null, underNames: ch?.names || [],
    };
  }
  const sum = (o, k) => Object.values(o).reduce((s, x) => s + (x[k] || 0), 0);
  const agency = {
    sales: Math.round(sum(cur, "sales")), shifts: sum(cur, "shifts"), salesPrev: Math.round(sum(prev, "sales")), shiftsPrev: sum(prev, "shifts"),
    cost: sum(cur, "cost"), ops: sum(chat, "ops"), under: sum(chat, "under"), underPrev: sum(chatPrev, "under"),
    costPrev: sum(costPrevBy, "cost"), salesPrevWages: sum(costPrevBy, "sales"),
  };
  agency.perShift = agency.shifts ? agency.sales / agency.shifts : null;
  agency.perShiftPrev = agency.shiftsPrev ? agency.salesPrev / agency.shiftsPrev : null;
  agency.costPct = agency.sales > 0 ? agency.cost / agency.sales : null;
  agency.costPctPrev = agency.salesPrevWages > 0 ? agency.costPrev / agency.salesPrevWages : null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const asOfDay = today.startsWith(periodId) ? Number(today.slice(8, 10)) : null;
  return { period: periodId, prev: prevId, medianCostPct, people, agency, asOfDay, computed_at: Date.now() };
}

export async function getCityLive(periodId = monthOf()) {
  const key = `citta:live:v5:${periodId}`;
  const hit = await kv.get(key);
  if (hit && Date.now() - (hit.computed_at || 0) < TTL * 1000) return hit;
  const fresh = await computeCityLive(periodId);
  await kv.set(key, fresh, { ex: TTL * 6 });
  return fresh;
}

// ── fusione con la fotografia ClickUp (pura, testabile) ────────────────────────
const grp = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const usd = (v) => "$" + grp(v);
const pct = (v, d = 1) => (v * 100).toLocaleString("it-IT", { maximumFractionDigits: d }) + "%";
const monthName = (pid) => MONTHS_IT[Number(String(pid).slice(5, 7)) - 1] || pid;

function salesArea(x, live) {
  if (!x || !x.sales) return { n: "Sales", s: "none", open: 0, late: 0, l: `Nessun venduto a ${monthName(live.period)} finora.`, src: "hoc" };
  const d = x.perShift != null && x.perShiftPrev ? x.perShift / x.perShiftPrev - 1 : null;
  const s = d != null && d <= SALES_DROP ? "wait" : "ok";
  const when = live.asOfDay ? `${monthName(live.period)} fino al ${live.asOfDay}` : monthName(live.period);
  const l = `Venduto a ${when}: ${usd(x.sales)} in ${grp(x.shifts)} turni. A turno ${usd(x.perShift)}` +
    (d != null ? `, ${d >= 0 ? "+" : "−"}${pct(Math.abs(d), 0)} rispetto a ${monthName(live.prev)} (la freccia guarda il venduto a turno, non il totale).` : ".");
  const trend = d == null ? null : d >= 0.05 ? "up" : d <= -0.05 ? "down" : "flat";
  return { n: "Sales", s, open: 0, late: 0, l, src: "hoc", trend, link: x.topAlias ? `/leaderboard/creators/${encodeURIComponent(x.topAlias)}` : "/leaderboard/creators" };
}
function financeArea(x, live) {
  if (!x || x.costPct == null) return { n: "Finance", s: "none", open: 0, late: 0, l: "Nessun venduto: costo operatori non calcolabile.", src: "hoc" };
  const high = live.medianCostPct != null && x.costPct >= live.medianCostPct + COST_HIGH_PTS;
  const dc = x.costPctPrev != null ? x.costPct - x.costPctPrev : null;
  const trend = dc == null ? null : dc <= -0.01 ? "up" : dc >= 0.01 ? "down" : "flat";
  return { n: "Finance", s: high ? "wait" : "ok", open: 0, late: 0, src: "hoc", trend, link: "/admin/pnl-live",
    l: `Costo operatori ${pct(x.costPct)} del venduto` + (live.medianCostPct != null ? ` (mediana delle creator ${pct(live.medianCostPct)}${high ? ": costo alto" : ""}).` : ".") };
}
function chattingArea(x) {
  if (!x || !x.ops) return { n: "Chatting", s: "none", open: 0, late: 0, l: "Nessun operatore ha questa creator come principale questo mese.", src: "hoc" };
  const avg = x.avgScore != null ? x.avgScore.toLocaleString("it-IT", { maximumFractionDigits: 1 }) : "—";
  const share = x.ops ? x.under / x.ops : 0;
  const grave = share >= CHAT_SHARE || (x.avgScore != null && x.avgScore < CHAT_AVG_MIN);
  const du = x.underPrev != null ? x.under - x.underPrev : null;
  const trend = du == null ? null : du < 0 ? "up" : du > 0 ? "down" : "flat";
  const who = x.underNames?.length ? ` (${x.underNames.slice(0, 4).join(", ")}${x.underNames.length > 4 ? "…" : ""})` : "";
  return { n: "Chatting", s: grave ? "wait" : "ok", open: 0, late: x.under, src: "hoc", trend, link: "/admin/action-center",
    l: `${x.ops} ${x.ops === 1 ? "operatore lavora" : "operatori lavorano"} soprattutto qui, score vendite medio ${avg}` +
      (x.under ? `; ${x.under} sotto soglia${who}${grave ? "" : ": caso isolato, non un problema diffuso"}.` : "; nessuno sotto soglia.") };
}

/** Sostituisce Sales/Finance/Chatting con i dati di HOC Pro e aggiunge il venduto (altezza).
 *  past=true: vista di un mese passato → i piani ClickUp non hanno storico (la fotografia è di oggi). */
export function mergeCityLive(snap, live, { past = false, claims = {} } = {}) {
  if (!snap?.projects || !live) return snap;
  const noHist = (a) => ({ n: a.n, s: "none", open: 0, late: 0, src: "clickup", l: "Nessuno storico ClickUp per questo mese: la fotografia di ClickUp è di oggi." });
  const swapT = (tower, areas, map) => areas.map((a) => { const b = map[a.n] || (past ? noHist(a) : { ...a, src: "clickup" }); const c = claims[`${tower}|${a.n}`]; return c ? { ...b, claim: { by: c.by, at: c.at } } : b; });
  const projects = snap.projects.map((p) => {
    const x = live.people[p.n];
    return { ...p, sales: x?.sales || 0, salesPrev: x?.salesPrev || 0,
      areas: swapT(p.n, p.areas, { Sales: salesArea(x, live), Finance: financeArea(x, live), Chatting: chattingArea(x) }) };
  });
  const ag = live.agency;
  const hq = { ...snap.hq, sales: ag.sales,
    areas: swapT(snap.hq.n, snap.hq.areas, {
      Sales: salesArea({ ...ag }, live),
      Finance: financeArea({ costPct: ag.costPct, costPctPrev: ag.costPctPrev }, { ...live, medianCostPct: null }),
      Chatting: { n: "Chatting", s: ag.under ? "wait" : "ok", open: 0, late: ag.under, src: "hoc", link: "/admin/action-center",
        trend: ag.underPrev == null ? null : ag.under < ag.underPrev ? "up" : ag.under > ag.underPrev ? "down" : "flat",
        l: `${ag.under} operatori sotto soglia (score ≤ ${UNDER_SCORE}, almeno ${UNDER_MIN_SHIFTS} turni) su ${ag.ops} in classifica.` },
    }) };
  // Da guardare: solo segnali MISURATI, pesati per gravità (le stime ClickUp non entrano in agenda)
  const top = [];
  for (const p of projects) {
    const x = live.people[p.n]; if (!x) continue;
    const d = x.perShift != null && x.perShiftPrev ? x.perShift / x.perShiftPrev - 1 : null;
    if (d != null && d <= SALES_DROP) top.push({ tower: p.n, area: "Sales", score: -d * 100, text: `venduto a turno ${pct(d, 0).replace("-", "−")}` });
    const share = x.ops ? x.under / x.ops : 0;
    if (x.ops && (share >= CHAT_SHARE || (x.avgScore != null && x.avgScore < CHAT_AVG_MIN))) top.push({ tower: p.n, area: "Chatting", score: share * 100 + (x.avgScore < CHAT_AVG_MIN ? 15 : 0), text: `${x.under} su ${x.ops} operatori sotto soglia` });
    if (x.costPct != null && live.medianCostPct != null && x.costPct >= live.medianCostPct + COST_HIGH_PTS) top.push({ tower: p.n, area: "Finance", score: (x.costPct - live.medianCostPct) * 1000, text: `costo operatori ${pct(x.costPct)} (mediana ${pct(live.medianCostPct)})` });
  }
  top.sort((a, b) => b.score - a.score);
  return { ...snap, projects, hq, top: top.slice(0, 5), live: { asOfDay: live.asOfDay, period: live.period, prev: live.prev, computed_at: live.computed_at, past, label: monthName(live.period) } };
}

export const currentMonthId = () => monthOf();
export const previousMonthId = (pid) => prevMonth(pid || monthOf());
export function monthLabel(pid) { return monthName(pid);
}
