// Gli uffici della città (27/09/2026, idea di Nicholas): dentro ogni palazzo le PERSONE.
//   Team chat      — gli operatori che fanno turni sulle pagine di quella creator (matrice di Creator:
//                    turni a quota, venduto e compenso attribuiti a quella creator), con chi è sotto soglia.
//   Team progetto  — chi ci lavora secondo ClickUp (assegnatari delle attività aperte, `citta:teams`)
//                    più/meno quello che dice l'anagrafica (`citta:people`): ruolo, costo, accordo.
//   Presenza       — occupato/libero adesso da Google Calendar (lib/google-calendar), se collegato.
// Costi del team progetto in €/mese scritti a mano (i chatter sono in $ dal P&L): non si sommano
// tra loro. "Quanto pesa" = quota del costo del team progetto di quel palazzo; chi lavora su più
// palazzi pesa per quota uguale su ognuno (dichiarato in pagina) finché non lo si dice diversamente.
import { kv } from "@vercel/kv";
import { buildCreatorMatrix } from "@/lib/creator-aggregates";
import { personOf, getCityLive, currentMonthId } from "@/lib/citta-live";
import { TEAMS_KEY } from "@/lib/citta-clickup";
import { freeBusyNow, calendarConfigured } from "@/lib/google-calendar";

export const PEOPLE_KEY = "citta:people";
export const ROLES = ["Account manager", "Sales manager", "Social media manager", "Editor", "Videomaker / fotografo", "Content manager", "Project manager", "Chatting manager", "Altro"];
const HQ = "Azienda";

const str = (v, n) => String(v ?? "").trim().slice(0, n);
export const personKey = (p) => (p.email ? p.email.toLowerCase() : p.cuId ? `cu:${p.cuId}` : `n:${str(p.name, 60).toLowerCase()}`);

export function cleanPerson(raw, towers = []) {
  const email = str(raw?.email, 120).toLowerCase();
  const p = {
    name: str(raw?.name, 80),
    email: /^[^@\s]+@[^@\s]+$/.test(email) ? email : "",
    cuId: str(raw?.cuId, 20).replace(/\D/g, ""),
    role: ROLES.includes(raw?.role) ? raw.role : "",
    cost: Number.isFinite(Number(raw?.cost)) && Number(raw.cost) >= 0 && raw?.cost !== "" && raw?.cost != null ? Math.round(Number(raw.cost)) : null,
    deal: str(raw?.deal, 200),
    phone: str(raw?.phone, 30).replace(/[^\d+ ]/g, ""),
    // null = segui ClickUp; lista = decido io su quali palazzi lavora
    projects: Array.isArray(raw?.projects) ? raw.projects.map((t) => str(t, 60)).filter((t) => towers.includes(t)) : null,
    hidden: Boolean(raw?.hidden),
  };
  if (!p.name && !p.email) throw new Error("Serve almeno nome o email");
  return p;
}

export async function getPeople() { return (await kv.get(PEOPLE_KEY)) || {}; }
export async function savePerson(raw, towers, by) {
  const p = cleanPerson(raw, towers);
  const all = await getPeople();
  const key = raw?.key && all[raw.key] ? raw.key : personKey(p);
  if (raw?.key && raw.key !== key) delete all[raw.key];
  all[key] = { ...p, updated_at: Date.now(), updated_by: str(by, 80) };
  await kv.set(PEOPLE_KEY, all);
  return { key, person: all[key] };
}
export async function deletePerson(key) {
  const all = await getPeople();
  delete all[key];
  await kv.set(PEOPLE_KEY, all);
}

const normName = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
// quale dei due doppioni tenere: scheda compilata > email aziendale > più attività
const rank = (d) => (d.card ? 4 : 0) + (d.email && !/@(gmail|hotmail|yahoo|icloud|outlook|libero)\./.test(d.email) ? 2 : 0) + Object.values(d.clickup).reduce((s, x) => s + x.open, 0) / 1e4;

/** Tutte le persone note (ClickUp + anagrafica), con i palazzi su cui lavorano. Pura sui dati passati. */
export function directory(teams, people, towers) {
  const dir = {};
  const ensure = (k, base) => (dir[k] ||= { key: k, name: base.name || "", email: base.email || "", cuId: base.cuId || "", clickup: {}, card: null });
  for (const [tower, list] of Object.entries(teams?.towers || {})) {
    for (const m of list || []) {
      const k = personKey(m);
      ensure(k, m).clickup[tower] = { open: m.open, late: m.late, areas: m.areas || [] };
      if (!dir[k].name) dir[k].name = m.name;
    }
  }
  for (const [k, c] of Object.entries(people || {})) {
    const d = ensure(k, c);
    d.card = c;
    if (c.name) d.name = c.name;
    if (c.email) d.email = c.email;
  }
  // stessa persona con due account ClickUp (email aziendale + gmail): si uniscono per nome,
  // tenendo l'email aziendale (serve alla presenza). Mai unire due schede compilate a mano.
  const byName = {};
  for (const d of Object.values(dir)) {
    const n = normName(d.name);
    if (!n) continue;
    const other = byName[n];
    if (!other) { byName[n] = d; continue; }
    if (other.card && d.card) continue;
    const [keep, drop] = rank(d) > rank(other) ? [d, other] : [other, d];
    for (const [t, v] of Object.entries(drop.clickup)) {
      const k = keep.clickup[t];
      keep.clickup[t] = k ? { open: k.open + v.open, late: k.late + v.late, areas: [...new Set([...k.areas, ...v.areas])].slice(0, 3) } : v;
    }
    keep.card ||= drop.card;
    keep.aliases = [...(keep.aliases || []), drop.key];
    delete dir[drop.key];
    byName[n] = keep;
  }
  for (const d of Object.values(dir)) {
    if (d.name && d.name === d.name.toLowerCase()) d.name = d.name.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
    const fromCu = Object.keys(d.clickup);
    d.projects = (d.card?.projects ?? fromCu).filter((t) => t === HQ || towers.includes(t));
  }
  return Object.values(dir).filter((d) => !d.card?.hidden);
}

const firstTwo = (s) => String(s || "").split(" ").slice(0, 2).join(" ");

/** L'ufficio di un palazzo: team chat + team progetto + presenza. */
export async function buildOffice(tower, periodId = currentMonthId()) {
  const [matrix, live, teams, people, comp] = await Promise.all([
    buildCreatorMatrix(periodId), getCityLive(periodId), kv.get(TEAMS_KEY), getPeople(), kv.get("citta:comp"),
  ]);
  const towers = (comp?.projects || []).map((p) => p.n);
  if (tower !== HQ && !towers.includes(tower)) throw new Error("Palazzo sconosciuto");

  // ── team chat (solo palazzi-creator: in sede sarebbero tutti gli operatori)
  let chatters = [];
  const x = live?.people?.[tower];
  if (tower !== HQ) {
    const under = new Set(x?.underNames || []);
    for (const [op, cells] of Object.entries(matrix?.matrix || matrix || {})) {
      if (!cells || typeof cells !== "object") continue;
      let sales = 0, shifts = 0, cost = 0, pages = [];
      for (const [alias, c] of Object.entries(cells)) {
        if (personOf(alias) !== tower || !c || typeof c.sales !== "number") continue;
        sales += c.sales; shifts += c.shifts || 0; cost += c.earnings || 0; pages.push(alias);
      }
      if (shifts <= 0) continue;
      chatters.push({ name: op, shifts: Math.round(shifts * 10) / 10, sales: Math.round(sales), cost: Math.round(cost), perShift: shifts ? Math.round(sales / shifts) : null, pages, under: under.has(firstTwo(op)) });
    }
    const tot = chatters.reduce((s, c) => s + c.sales, 0);
    chatters = chatters.map((c) => ({ ...c, share: tot ? c.sales / tot : 0 })).sort((a, b) => b.sales - a.sales);
  }

  // ── team progetto
  const dir = directory(teams, people, towers);
  const members = dir.filter((d) => d.projects.includes(tower)).map((d) => {
    const nProj = Math.max(1, d.projects.filter((t) => t !== HQ).length || 1);
    const cost = d.card?.cost ?? null;
    return {
      key: d.key, name: d.name, email: d.email, role: d.card?.role || "", deal: d.card?.deal || "", phone: d.card?.phone || "",
      cost, costHere: cost != null ? Math.round(tower === HQ ? cost : cost / nProj) : null, projectsCount: nProj,
      fromClickup: Boolean(d.clickup[tower]), open: d.clickup[tower]?.open || 0, late: d.clickup[tower]?.late || 0, areas: d.clickup[tower]?.areas || [],
      pinned: Array.isArray(d.card?.projects),
    };
  });
  const teamCost = members.reduce((s, m) => s + (m.costHere || 0), 0);
  for (const m of members) m.weight = teamCost && m.costHere != null ? m.costHere / teamCost : null;
  // prima chi ha un ruolo (è stato "riconosciuto"), poi per carico di lavoro
  members.sort((a, b) => Number(Boolean(b.role)) - Number(Boolean(a.role)) || (b.costHere || 0) - (a.costHere || 0) || b.open - a.open);

  // ── presenza
  const calendar = { configured: calendarConfigured(), error: null };
  if (calendar.configured) {
    try {
      const fb = await freeBusyNow(members.map((m) => m.email));
      for (const m of members) if (m.email && fb[m.email]) m.presence = fb[m.email];
    } catch (e) { calendar.error = String(e?.message || e); }
  }

  return {
    tower, period: periodId, sales: tower === HQ ? live?.agency?.sales || 0 : x?.sales || 0,
    chatters, chatCost: chatters.reduce((s, c) => s + c.cost, 0),
    members, teamCost, missingCost: members.filter((m) => m.cost == null).length,
    calendar, clickupAt: teams?.at || null, towers: [...towers, HQ],
  };
}
