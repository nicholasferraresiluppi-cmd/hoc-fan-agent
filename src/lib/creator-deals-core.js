/**
 * Accordi creator ed ecosistemi — logica pura (15/10/2026, Nicholas).
 *
 * "Lato deal e net sulle creator": per ogni creator la percentuale che resta a
 * HOC sulle sue revenue (in DOLLARI, a scaglioni o flat), convertita in euro al
 * cambio del mese; poi, per ecosistema (= una squadra dei Compensi team), quanto
 * entra dalle sue creator meno quanto costa la squadra = il netto.
 *
 * Le percentuali arrivano dal foglio di Nicholas in forma di testo
 * ("30% <= 25k; 35% <= 50k; 45% > 65k;", "60% flat"): `parseDealText` le legge.
 *
 * Scaglioni: la percentuale dello scaglione raggiunto vale su TUTTA la revenue
 * (confermato da Nicholas 15/10/2026, come la gamification dei compensi e le wage CP).
 * Il modo "progressivo" (fasce tipo IRPEF) resta nel calcolo ma non in pagina.
 *
 * Solo le creator dello split di Nicholas (le altre: accordo non attivo).
 * Fuori da qui (dichiarato in pagina): il costo degli operatori (wage CP) e le
 * squadre non assegnate a un ecosistema non entrano nel netto.
 */
import { normalizeTiers, tierFor, personKey, toNumber } from "./compensi-core.js";

export const DEAL_MODES = ["raggiunto", "progressivo"];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** "25k" / "1,5k" / "130.000" / "65000" → dollari. */
function amount(s) {
  const m = String(s).trim().match(/^([\d.,]+)\s*(k)?$/i);
  if (!m) return null;
  let v = m[2] ? Number(m[1].replace(",", ".")) * 1000 : toNumber(m[1]);
  return Number.isFinite(v) ? v : null;
}

/**
 * Testo del foglio → { tiers:[{fromUsd,pct}], warnings:[] }.
 * Ogni pezzo è "P% <= X" (fino a X), "P% > X" / "P% >= X" (sopra X) o "P% flat".
 * La soglia di partenza di un pezzo "fino a X" è il tetto del pezzo prima.
 */
export function parseDealText(text) {
  const warnings = [];
  const parts = String(text || "").split(/[;\n]+/).map((s) => s.trim().replace(/\.$/, "")).filter(Boolean);
  const segs = [];
  for (const p of parts) {
    const m = p.match(/^([\d.,]+)\s*%\s*(flat|<=|≤|<|>=|≥|>)?\s*([\d.,]+\s*k?)?$/i);
    if (!m) { warnings.push(`non capito: «${p}»`); continue; }
    const pct = toNumber(m[1]) / 100;
    const op = (m[2] || "flat").toLowerCase();
    const amt = m[3] ? amount(m[3]) : null;
    if (op !== "flat" && amt === null) { warnings.push(`soglia mancante: «${p}»`); continue; }
    segs.push({ pct, op, amt });
  }
  const tiers = [];
  let prevUpper = 0;
  for (const s of segs) {
    if (s.op === "flat") { tiers.push({ fromUsd: 0, pct: s.pct }); continue; }
    if (s.op === "<=" || s.op === "≤" || s.op === "<") {
      tiers.push({ fromUsd: prevUpper, pct: s.pct });
      prevUpper = s.amt;
    } else {
      // "sopra X": se è il primo pezzo, sotto X il foglio non dice nulla
      if (!tiers.length && s.amt > 0) warnings.push(`sotto ${s.amt.toLocaleString("it-IT")}$ la percentuale non è scritta: uso ${Math.round(s.pct * 1000) / 10}%`);
      tiers.push({ fromUsd: tiers.length ? s.amt : 0, pct: s.pct });
      prevUpper = s.amt;
    }
  }
  if (segs.length > 1 && segs.some((s) => s.op === "flat")) warnings.push("«flat» insieme ad altri scaglioni");
  return { tiers: normalizeTiers(tiers), warnings };
}

/** Testo leggibile degli scaglioni: "30% fino a 25.000$ · 35% sopra 25.000$". */
export function describeTiers(tiers) {
  const t = normalizeTiers(tiers);
  const p = (x) => `${(Math.round(x * 10000) / 100).toLocaleString("it-IT")}%`;
  const d = (x) => `${Math.round(x).toLocaleString("it-IT")}$`;
  if (t.length === 1 && t[0].fromUsd === 0) return `${p(t[0].pct)} flat`;
  return t.map((x, i) => {
    const next = t[i + 1];
    if (next) return x.fromUsd === 0 ? `${p(x.pct)} fino a ${d(next.fromUsd)}` : `${p(x.pct)} da ${d(x.fromUsd)} a ${d(next.fromUsd)}`;
    return `${p(x.pct)} sopra ${d(x.fromUsd)}`;
  }).join(" · ");
}

/** Quota HOC in dollari su una revenue. */
export function shareUsd(tiers, revenueUsd, mode = "raggiunto") {
  const rev = Math.max(0, Number(revenueUsd) || 0);
  const t = normalizeTiers(tiers);
  if (!rev || !t.length) return { usd: 0, pct: 0 };
  if (mode === "progressivo") {
    let usd = 0;
    t.forEach((x, i) => {
      const top = t[i + 1] ? t[i + 1].fromUsd : Infinity;
      const slice = Math.min(rev, top) - x.fromUsd;
      if (slice > 0) usd += slice * x.pct;
    });
    return { usd: round2(usd), pct: Math.round((usd / rev) * 1e6) / 1e6 };
  }
  // raggiunto: lo scaglione più alto con revenue > soglia, su tutto (tierFor dei compensi)
  const hit = tierFor(t, rev);
  return { usd: round2(rev * (hit?.pct || 0)), pct: hit?.pct || 0 };
}

/** Pulizia di un accordo che arriva dal client. */
export function sanitizeDeal(d, newId) {
  const str = (v, max = 200) => String(v ?? "").slice(0, max).trim();
  return {
    id: /^[a-z0-9_-]{4,40}$/i.test(d?.id || "") ? d.id : newId(),
    creator: str(d?.creator, 120),
    text: str(d?.text, 300),
    tiers: normalizeTiers(d?.tiers).filter((t) => t.pct <= 1),
    mode: DEAL_MODES.includes(d?.mode) ? d.mode : "raggiunto",
    ecosystem: str(d?.ecosystem, 120),          // nome della squadra nei Compensi team
    revenueName: str(d?.revenueName, 120),      // nome del progetto in «Revenue e cambio» (vuoto = nome creator)
    active: d?.active !== false,
    note: str(d?.note, 500),
  };
}

/** Pulizia della mappa squadra → ecosistema: { [nome squadra]: nome ecosistema ("" = nessuno). */
export function sanitizeTeamEcosystems(m) {
  const out = {};
  for (const [team, eco] of Object.entries(m && typeof m === "object" ? m : {}).slice(0, 200)) {
    const t = String(team).slice(0, 120).trim();
    if (t) out[t] = String(eco ?? "").slice(0, 120).trim();
  }
  return out;
}

/**
 * Il mese visto per creator ed ecosistema.
 * Un ecosistema è un NOME: ci stanno le creator che lo indicano nell'accordo e le
 * squadre dei compensi assegnate a lui (una squadra senza assegnazione appartiene
 * all'ecosistema col suo stesso nome, se esiste). Così un ecosistema può avere più
 * squadre (es. Cantera + Chatter Manager) e la stessa squadra non si conta due volte.
 * @param deals         accordi
 * @param monthDoc      il documento del mese dei Compensi (revenues, fx)
 * @param byTeam        computeMonth(monthDoc).byTeam (costo per squadra in €)
 * @param teamEcosystems { [nome squadra]: nome ecosistema }
 */
export function computeDealsMonth(deals, monthDoc, byTeam, teamEcosystems = {}) {
  const fx = toNumber(monthDoc?.fx?.rate);
  const revByKey = new Map((monthDoc?.revenues || []).map((r) => [personKey(r.name), r]));
  const creators = (deals || []).filter((d) => d.active !== false).map((d) => {
    const rev = revByKey.get(personKey(d.revenueName || d.creator));
    const revenueUsd = rev && rev.usd !== null && rev.usd !== "" ? toNumber(rev.usd) : null;
    const s = revenueUsd !== null ? shareUsd(d.tiers, revenueUsd, d.mode) : null;
    const problems = [];
    if (!rev) problems.push("nessun progetto con questo nome in «Revenue e cambio»");
    else if (revenueUsd === null) problems.push("revenue del mese non inserita");
    if (!(fx > 0)) problems.push("manca il cambio del mese");
    if (!normalizeTiers(d.tiers).length) problems.push("percentuale non impostata");
    const shareEur = s && fx > 0 ? round2(s.usd * fx) : null;
    return {
      ...d,
      revenueUsd,
      revenueEur: revenueUsd !== null && fx > 0 ? round2(revenueUsd * fx) : null,
      pctApplied: s?.pct ?? null,
      shareUsd: s?.usd ?? null,
      shareEur,
      creatorEur: shareEur !== null ? round2(revenueUsd * fx - shareEur) : null,
      problems,
    };
  });

  const eco = new Map();
  const ecoOf = (name) => {
    const k = personKey(name);
    if (!eco.has(k)) eco.set(k, { key: k, ecosystem: name, creators: [], teams: [], shareEur: 0, missingShare: 0, costEur: 0 });
    return eco.get(k);
  };
  for (const c of creators) {
    if (!personKey(c.ecosystem)) continue;
    const e = ecoOf(c.ecosystem);
    e.creators.push(c);
    if (c.shareEur === null) e.missingShare++; else e.shareEur = round2(e.shareEur + c.shareEur);
  }
  const assigned = new Map(Object.entries(sanitizeTeamEcosystems(teamEcosystems)).map(([t, e]) => [personKey(t), e]));
  const otherTeams = [];
  for (const t of byTeam || []) {
    const tk = personKey(t.team);
    const target = assigned.has(tk) ? assigned.get(tk) : (eco.has(tk) ? eco.get(tk).ecosystem : "");
    if (!personKey(target)) { otherTeams.push(t); continue; }
    const e = ecoOf(target);
    e.teams.push({ team: t.team, totalEur: t.totalEur, lines: t.lines.length });
    e.costEur = round2(e.costEur + t.totalEur);
  }
  const ecosystems = [...eco.values()].map((e) => ({ ...e, netEur: round2(e.shareEur - e.costEur) })).sort((a, b) => b.netEur - a.netEur);

  const sum = (arr, f) => round2(arr.reduce((s, x) => s + (f(x) || 0), 0));
  const dealKeys = new Set(creators.map((c) => personKey(c.revenueName || c.creator)));
  const ecoShare = sum(ecosystems, (e) => e.shareEur);
  const ecoCost = sum(ecosystems, (e) => e.costEur);
  return {
    fx: fx > 0 ? fx : null,
    creators,
    ecosystems,
    otherTeams: otherTeams.sort((a, b) => b.totalEur - a.totalEur),
    unlinkedCreators: creators.filter((c) => !personKey(c.ecosystem)),
    revenuesWithoutDeal: (monthDoc?.revenues || []).filter((r) => !dealKeys.has(personKey(r.name))),
    totals: {
      revenueUsd: sum(creators, (c) => c.revenueUsd),
      shareUsd: sum(creators, (c) => c.shareUsd),
      shareEur: sum(creators, (c) => c.shareEur),
      ecoShare,
      ecoCost,
      ecoNet: round2(ecoShare - ecoCost),
      otherCost: sum(otherTeams, (t) => t.totalEur),
      problems: creators.filter((c) => c.problems.length).length,
    },
  };
}
