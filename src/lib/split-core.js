/**
 * Conto dello split — logica pura (15/10/2026, Nicholas).
 *
 * Il foglio "Team & Stipendi" di Nicholas portato in app.
 *  - TEAM = una creator dello split (Team Fishball ITA, Team Anastasia…), con
 *    l'accordo HOC sulla sua revenue; più team senza creator (Academy, MB/Finance).
 *  - ACCORDO PERSONA = quanto prende una persona e su quali team: fisso €, e/o
 *    percentuale sulla revenue $ SOMMATA dei suoi team (scaglione raggiunto, su
 *    tutto; eventuale tetto), con eventuale minimo garantito (€ o $): vale il più
 *    alto tra minimo e percentuale. Il costo si divide tra i suoi team in parti
 *    uguali (come nel foglio: Giovanna 1000€ × 3 progetti) o in proporzione alla
 *    revenue. Una stessa persona può avere più accordi (Daniele: 15% su Martina,
 *    10% su Cubanita…), anche a tempo (+500€ a ottobre e novembre per formazione).
 *
 * Per ogni mese:
 *   fee €     = revenue $ × % accordo creator × cambio
 *   persone € = la parte di ogni accordo persona che cade sul team
 *   chatter € = costo operatori $ × cambio
 *   extra €   = spese una tantum del mese (es. token da 250€ a Eleonora)
 *   netto     = fee € − persone − chatter − extra
 *
 * Verificato sul foglio di agosto 2026 al centesimo (tests/split.mjs).
 */
import { personKey, toNumber, normalizeTiers, isMonthId } from "./compensi-core.js";
import { parseDealText, shareUsd } from "./creator-deals-core.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const str = (v, max = 200) => String(v ?? "").slice(0, max).trim();
const optNum = (v) => (v === null || v === undefined || v === "" ? null : round2(toNumber(v)));
const optMonth = (v) => (isMonthId(v) ? v : null);
const okId = (v) => /^[a-z0-9_-]{4,40}$/i.test(v || "");

/** Attivo nel mese? from/to inclusivi, vuoti = aperti. */
export const activeIn = (x, m) => (!x?.from || x.from <= m) && (!x?.to || x.to >= m);

const parsePct = (text) => (str(text) ? parseDealText(text) : { tiers: [], warnings: [] });

export function sanitizeTeam(t, newId) {
  return {
    id: okId(t?.id) ? t.id : newId(),
    name: str(t?.name, 120),
    creator: str(t?.creator, 120),           // vuoto = team senza creator (Academy, struttura)
    dealText: str(t?.dealText, 300),
    tiers: parsePct(t?.dealText).tiers,
    manager: str(t?.manager, 120),
    creatorIds: (Array.isArray(t?.creatorIds) ? t.creatorIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 10), // pagine OnlyFans (warehouse)
    cpAliases: (Array.isArray(t?.cpAliases) ? t.cpAliases : []).map((a) => str(a, 120)).filter(Boolean).slice(0, 10), // alias CreatorsPro (costo chatter)
    from: optMonth(t?.from), to: optMonth(t?.to),
    note: str(t?.note, 500),
  };
}

export function sanitizePerson(x, newId) {
  return {
    id: okId(x?.id) ? x.id : newId(),
    person: str(x?.person, 120),
    role: str(x?.role, 120),
    teamIds: (Array.isArray(x?.teamIds) ? x.teamIds : []).filter(okId).slice(0, 20),
    alloc: x?.alloc === "revenue" ? "revenue" : "uguale",
    fixedEur: optNum(x?.fixedEur),
    pctText: str(x?.pctText, 200),
    tiers: parsePct(x?.pctText).tiers,
    capUsd: optNum(x?.capUsd),             // la % si calcola sulla revenue fino a qui ("10% fino a 100k")
    min: optNum(x?.min),                   // minimo garantito
    minCur: x?.minCur === "USD" ? "USD" : "EUR",
    from: optMonth(x?.from), to: optMonth(x?.to),
    note: str(x?.note, 500),
  };
}

export function sanitizeConfig(c, newId) {
  const teams = (Array.isArray(c?.teams) ? c.teams : []).slice(0, 100).map((t) => sanitizeTeam(t, newId)).filter((t) => t.name);
  const ids = new Set(teams.map((t) => t.id));
  const people = (Array.isArray(c?.people) ? c.people : []).slice(0, 400).map((x) => sanitizePerson(x, newId))
    .map((x) => ({ ...x, teamIds: x.teamIds.filter((i) => ids.has(i)) }))
    .filter((x) => x.person || x.role);
  return { teams, people };
}

export function sanitizeMonthInput(d, newId) {
  const teams = {};
  for (const [id, v] of Object.entries(d?.teams && typeof d.teams === "object" ? d.teams : {}).slice(0, 200)) {
    if (!okId(id)) continue;
    teams[id] = {
      revenueUsd: optNum(v?.revenueUsd), chatterUsd: optNum(v?.chatterUsd), revenueSource: str(v?.revenueSource, 120), chatterSource: str(v?.chatterSource, 160),
      // buste CreatorsPro che compongono il chatter (per controllarle una per una)
      chatterBuste: (Array.isArray(v?.chatterBuste) ? v.chatterBuste : []).slice(0, 80).map((b) => ({ name: str(b?.name, 120), status: str(b?.status, 20), usd: round2(toNumber(b?.usd)), wageUsd: round2(toNumber(b?.wageUsd)), shared: Boolean(b?.shared) })),
    };
  }
  const rate = toNumber(d?.fx?.rate);
  return {
    fx: { rate: rate > 0 && rate < 5 ? Math.round(rate * 1e6) / 1e6 : null, source: str(d?.fx?.source, 120) || null },
    teams,
    extras: (Array.isArray(d?.extras) ? d.extras : []).slice(0, 200).map((x) => ({
      id: okId(x?.id) ? x.id : newId(),
      teamId: str(x?.teamId, 40),
      label: str(x?.label, 200),
      person: str(x?.person, 120),
      eur: round2(toNumber(x?.eur)),
    })).filter((x) => x.label || x.eur),
    note: str(d?.note, 1000),
    // buste tolte dal conto del mese (es. turno sospetto da verificare): per nome dell'operatore
    excludedBuste: (Array.isArray(d?.excludedBuste) ? d.excludedBuste : []).slice(0, 50)
      .map((x) => ({ name: str(x?.name, 120), note: str(x?.note, 300), at: Number(x?.at) || null })).filter((x) => x.name),
  };
}

/** Costo di un accordo persona dato il revenue $ della sua base. */
export function personCost(x, baseUsd, fx) {
  const fixed = toNumber(x?.fixedEur);
  const tiers = normalizeTiers(x?.tiers);
  const problems = [];
  let commissionUsd = 0, commissionEur = 0, pct = 0;
  if (tiers.length) {
    if (baseUsd === null || baseUsd === undefined) problems.push("revenue dei suoi team mancante");
    const base = x?.capUsd > 0 ? Math.min(toNumber(baseUsd), x.capUsd) : toNumber(baseUsd);
    const s = shareUsd(tiers, base, "raggiunto");
    commissionUsd = s.usd; pct = s.pct;
    commissionEur = fx > 0 ? round2(s.usd * fx) : 0;
  }
  const minRaw = toNumber(x?.min);
  const minEur = x?.minCur === "USD" ? (fx > 0 ? round2(minRaw * fx) : 0) : minRaw;
  if ((tiers.length || x?.minCur === "USD") && !(fx > 0)) problems.push("manca il cambio");
  const minApplied = minEur > 0 && minEur > commissionEur;
  return { eur: round2(fixed + (minApplied ? minEur : commissionEur)), fixedEur: round2(fixed), commissionUsd, commissionEur, pct, minEur, minApplied, problems };
}

/**
 * Il mese intero.
 * @param config { teams:[…], people:[…] }
 * @param month  { month, fx, teams:{[teamId]:{revenueUsd, chatterUsd}}, extras:[…] }
 */
export function computeSplitMonth(config, month) {
  const m = month?.month;
  const fx = toNumber(month?.fx?.rate);
  const inputs = month?.teams || {};
  const teamsIn = (config?.teams || []).filter((t) => activeIn(t, m));
  const revOf = new Map(teamsIn.map((t) => {
    const v = inputs[t.id]?.revenueUsd;
    return [t.id, v === null || v === undefined || v === "" ? null : toNumber(v)];
  }));

  // accordi persona del mese → costo totale e ripartizione sui team attivi
  // un accordo con team tutti fuori dal mese (es. creator non ancora partita) non costa; senza team = costo d'agenzia
  const deals = (config?.people || []).filter((x) => activeIn(x, m) && (!x.teamIds.length || x.teamIds.some((i) => revOf.has(i)))).map((x) => {
    const ts = x.teamIds.filter((i) => revOf.has(i));
    const revs = ts.map((i) => revOf.get(i));
    const baseUsd = revs.some((r) => r === null) && normalizeTiers(x.tiers).length ? null : round2(revs.reduce((s, r) => s + (r || 0), 0));
    const cost = personCost(x, baseUsd, fx);
    const totRev = revs.reduce((s, r) => s + (r || 0), 0);
    const parts = ts.map((i) => ({ teamId: i, share: x.alloc === "revenue" && totRev > 0 ? (revOf.get(i) || 0) / totRev : 1 / ts.length }));
    return { ...x, baseUsd, cost, parts, orphan: ts.length === 0 };
  });

  const teams = teamsIn.map((t) => {
    const inp = inputs[t.id] || {};
    const revenueUsd = revOf.get(t.id);
    const problems = [];
    const hasDeal = normalizeTiers(t.tiers).length > 0;
    let feeUsd = 0, feePct = 0;
    if (t.creator) {
      if (!hasDeal) problems.push("accordo con la creator non impostato");
      if (revenueUsd === null) problems.push("revenue del mese non inserita");
      if (hasDeal && revenueUsd !== null) ({ usd: feeUsd, pct: feePct } = shareUsd(t.tiers, revenueUsd, "raggiunto"));
    }
    if (!(fx > 0)) problems.push("manca il cambio del mese");
    const feeEur = fx > 0 ? round2(feeUsd * fx) : 0;
    const members = deals.flatMap((d) => d.parts.filter((p) => p.teamId === t.id).map((p) => ({
      id: d.id, person: d.person, role: d.role, share: p.share, eur: round2(d.cost.eur * p.share), deal: d,
    })));
    const staffEur = round2(members.reduce((s, x) => s + x.eur, 0));
    const chatterUsd = inp.chatterUsd === null || inp.chatterUsd === undefined || inp.chatterUsd === "" ? null : toNumber(inp.chatterUsd);
    const chatterEur = chatterUsd !== null && fx > 0 ? round2(chatterUsd * fx) : 0;
    const extras = (month?.extras || []).filter((x) => x.teamId === t.id);
    const extrasEur = round2(extras.reduce((s, x) => s + toNumber(x.eur), 0));
    const costEur = round2(staffEur + chatterEur + extrasEur);
    return {
      ...t, revenueUsd, revenueSource: inp.revenueSource || "", chatterSource: inp.chatterSource || "", chatterBuste: inp.chatterBuste || [],
      feeUsd: round2(feeUsd), feePct, feeEur, members, staffEur, chatterUsd, chatterEur, extras, extrasEur, costEur,
      netEur: round2(feeEur - costEur),
      problems: [...new Set([...problems, ...members.flatMap((x) => x.deal.cost.problems)])],
    };
  });

  const ids = new Set(teams.map((t) => t.id));
  const agencyExtras = (month?.extras || []).filter((x) => !ids.has(x.teamId));
  const orphans = deals.filter((d) => d.orphan && d.cost.eur);
  const sum = (arr, f) => round2(arr.reduce((s, x) => s + (Number(f(x)) || 0), 0));
  const agencyEur = round2(sum(agencyExtras, (x) => toNumber(x.eur)) + sum(orphans, (d) => d.cost.eur));
  const feeEur = sum(teams, (t) => t.feeEur);
  const costEur = round2(sum(teams, (t) => t.costEur) + agencyEur);

  // totale del mese per persona (somma dei suoi accordi)
  const people = new Map();
  for (const d of deals) {
    const k = personKey(d.person) || `—${d.role}`;
    if (!people.has(k)) people.set(k, { key: k, person: d.person || "(da assegnare)", roles: new Set(), deals: [], eur: 0 });
    const p = people.get(k);
    if (d.role) p.roles.add(d.role);
    p.deals.push(d);
    p.eur = round2(p.eur + d.cost.eur);
  }
  return {
    month: m,
    fx: fx > 0 ? fx : null,
    teams,
    deals,
    agencyExtras,
    orphans,
    people: [...people.values()].map((p) => ({ ...p, roles: [...p.roles] })).sort((a, b) => b.eur - a.eur),
    totals: {
      revenueUsd: sum(teams, (t) => t.revenueUsd),
      feeUsd: sum(teams, (t) => t.feeUsd),
      feeEur,
      staffEur: round2(sum(teams, (t) => t.staffEur) + sum(orphans, (d) => d.cost.eur)),
      chatterUsd: sum(teams, (t) => t.chatterUsd),
      chatterEur: sum(teams, (t) => t.chatterEur),
      extrasEur: round2(sum(teams, (t) => t.extrasEur) + sum(agencyExtras, (x) => toNumber(x.eur))),
      costEur,
      netEur: round2(feeEur - costEur),
      problems: teams.filter((t) => t.problems.length).length,
    },
  };
}

// ── Chatter busta per busta (15/10/2026) ─────────────────────────────────────
// Le buste CreatorsPro del mese (una per operatore). Per ogni busta: il costo di
// ogni turno va alle modelle del turno in proporzione al venduto su ciascuna (due
// modelle nello stesso turno → costo diviso; nessuna vendita → parti uguali); se la
// busta ha voci fuori dai turni (ore pagate, rettifiche), il totale della busta si
// ridistribuisce con le stesse proporzioni. Così la somma per team = buste reali.
export const CLOSED_WAGE_STATUSES = ["PAID", "CLOSED", "PAYABLE"];

export function chatterFromWages(wages, teams) {
  const teamOf = new Map();
  for (const t of teams || []) for (const a of t.cpAliases || []) teamOf.set(a, t.id);
  const byTeam = {};
  const status = {};
  for (const w of wages || []) {
    const perAlias = new Map();
    let shiftSum = 0;
    for (const s of w.shifts || []) {
      const earn = Number(s.total_earnings) || 0;
      const hours = Number(s.worked_hours) || 0;
      const sales = new Map();
      for (const k of s.takes || []) if (k.creator_alias) sales.set(k.creator_alias, (sales.get(k.creator_alias) || 0) + (Number(k.amount) || 0));
      const tot = [...sales.values()].reduce((a, b) => a + b, 0);
      const aliases = tot > 0 ? [...sales.keys()] : (s.creator_aliases || []);
      for (const a of aliases) {
        const share = tot > 0 ? sales.get(a) / tot : 1 / aliases.length;
        const cur = perAlias.get(a) || { earn: 0, hours: 0 };
        cur.earn += earn * share; cur.hours += hours * share;
        perAlias.set(a, cur);
      }
      shiftSum += earn;
    }
    const ours = [...perAlias.keys()].filter((a) => teamOf.has(a));
    if (!ours.length) continue;
    status[w.status || "?"] = (status[w.status || "?"] || 0) + 1;
    const wage = Number(w.total_wage ?? shiftSum) || 0;
    const hoursAll = [...perAlias.values()].reduce((s, v) => s + v.hours, 0);
    const perTeam = new Map();
    for (const a of ours) {
      const v = perAlias.get(a);
      const usd = shiftSum > 0 ? wage * (v.earn / shiftSum) : hoursAll > 0 ? wage * (v.hours / hoursAll) : 0;
      perTeam.set(teamOf.get(a), (perTeam.get(teamOf.get(a)) || 0) + usd);
    }
    for (const [teamId, usd] of perTeam) {
      if (!byTeam[teamId]) byTeam[teamId] = { usd: 0, buste: [] };
      byTeam[teamId].usd = round2(byTeam[teamId].usd + usd);
      byTeam[teamId].buste.push({ name: w.member_name || w.member_username || "?", status: w.status || "?", usd: round2(usd), wageUsd: round2(wage), shared: perTeam.size > 1 || ours.length < perAlias.size });
    }
  }
  for (const v of Object.values(byTeam)) v.buste.sort((a, b) => b.usd - a.usd);
  const open = Object.entries(status).filter(([s]) => !CLOSED_WAGE_STATUSES.includes(s)).reduce((n, [, c]) => n + c, 0);
  return { byTeam, status, total: Object.values(status).reduce((a, b) => a + b, 0), open };
}

/**
 * Toglie dal chatter del mese le buste escluse (per nome operatore, su tutti i team
 * dove compaiono) e ricalcola la fonte "N su M non chiuse" sulle buste rimaste.
 * Lavora sull'input del mese (teams:{[id]:{chatterUsd, chatterBuste}}), puro.
 */
export function applyBusteExclusions(teamsInput, excluded) {
  const out = {};
  const ex = new Set((excluded || []).map((x) => personKey(x.name)));
  const names = new Map();
  for (const [id, v] of Object.entries(teamsInput || {})) {
    const buste = v?.chatterBuste || [];
    if (!buste.length) { out[id] = v; continue; }
    const keep = buste.filter((b) => !ex.has(personKey(b.name)));
    const removed = buste.filter((b) => ex.has(personKey(b.name))).reduce((s, b) => s + (Number(b.usd) || 0), 0);
    for (const b of keep) names.set(personKey(b.name), (names.get(personKey(b.name)) || "") + "|" + b.status);
    out[id] = { ...v, chatterBuste: keep, chatterUsd: v.chatterUsd === null || v.chatterUsd === undefined ? v.chatterUsd : round2(Math.max(0, v.chatterUsd - removed)) };
  }
  const total = names.size;
  const open = [...names.values()].filter((st) => st.split("|").some((x) => x && !CLOSED_WAGE_STATUSES.includes(x))).length;
  const src = `buste CreatorsPro · ${open ? `${open} su ${total} non chiuse` : "tutte chiuse"}${ex.size ? ` · ${ex.size} esclus${ex.size === 1 ? "a" : "e"}` : ""}`;
  for (const v of Object.values(out)) if (v?.chatterBuste?.length || (v?.chatterSource || "").startsWith("buste")) v.chatterSource = src;
  return out;
}
