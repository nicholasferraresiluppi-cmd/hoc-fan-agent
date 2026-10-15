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
 * Due modi di applicare gli scaglioni (va scelto per accordo, il foglio non lo dice):
 *  - "raggiunto": la percentuale dello scaglione raggiunto vale su TUTTA la revenue
 *    (come la gamification dei compensi e le wage CP);
 *  - "progressivo": ogni fascia di revenue alla sua percentuale (come l'IRPEF).
 * La vista mostra sempre anche l'altro risultato, così la differenza si vede.
 *
 * Fuori da qui (dichiarato in pagina): il costo degli operatori (wage CP) e la
 * quota di struttura (direzione, HR, finance…) non sono ripartiti sugli ecosistemi.
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

/**
 * Il mese visto per creator ed ecosistema.
 * @param deals    accordi
 * @param monthDoc il documento del mese dei Compensi (revenues, fx)
 * @param byTeam   computeMonth(monthDoc).byTeam (costo per squadra in €)
 */
export function computeDealsMonth(deals, monthDoc, byTeam) {
  const fx = toNumber(monthDoc?.fx?.rate);
  const revByKey = new Map((monthDoc?.revenues || []).map((r) => [personKey(r.name), r]));
  const creators = (deals || []).filter((d) => d.active !== false).map((d) => {
    const rev = revByKey.get(personKey(d.revenueName || d.creator));
    const revenueUsd = rev && rev.usd !== null && rev.usd !== "" ? toNumber(rev.usd) : null;
    const other = d.mode === "progressivo" ? "raggiunto" : "progressivo";
    const s = revenueUsd !== null ? shareUsd(d.tiers, revenueUsd, d.mode) : null;
    const alt = revenueUsd !== null ? shareUsd(d.tiers, revenueUsd, other) : null;
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
      altShareUsd: alt?.usd ?? null,
      altMode: other,
      problems,
    };
  });

  const teamCost = new Map((byTeam || []).map((t) => [personKey(t.team), t]));
  const eco = new Map();
  for (const c of creators) {
    const k = personKey(c.ecosystem);
    if (!k) continue;
    if (!eco.has(k)) eco.set(k, { key: k, ecosystem: teamCost.get(k)?.team || c.ecosystem, creators: [], shareEur: 0, missingShare: 0 });
    const e = eco.get(k);
    e.creators.push(c);
    if (c.shareEur === null) e.missingShare++; else e.shareEur = round2(e.shareEur + c.shareEur);
  }
  const ecosystems = [...eco.values()].map((e) => {
    const team = teamCost.get(e.key);
    const costEur = team ? team.totalEur : 0;
    return { ...e, costEur, teamFound: Boolean(team), people: team ? team.lines.length : 0, netEur: round2(e.shareEur - costEur) };
  }).sort((a, b) => b.netEur - a.netEur);

  const linked = new Set(ecosystems.map((e) => e.key));
  const otherTeams = (byTeam || []).filter((t) => !linked.has(personKey(t.team))).sort((a, b) => b.totalEur - a.totalEur);
  const sum = (arr, f) => round2(arr.reduce((s, x) => s + (f(x) || 0), 0));
  const shareEur = sum(creators, (c) => c.shareEur);
  const ecoCost = sum(ecosystems, (e) => e.costEur);
  const otherCost = sum(otherTeams, (t) => t.totalEur);
  const dealKeys = new Set(creators.map((c) => personKey(c.revenueName || c.creator)));
  return {
    fx: fx > 0 ? fx : null,
    creators,
    ecosystems,
    otherTeams,
    unlinkedCreators: creators.filter((c) => !personKey(c.ecosystem)),
    revenuesWithoutDeal: (monthDoc?.revenues || []).filter((r) => !dealKeys.has(personKey(r.name))),
    totals: {
      revenueUsd: sum(creators, (c) => c.revenueUsd),
      shareUsd: sum(creators, (c) => c.shareUsd),
      shareEur,
      ecoCost,
      ecoNet: round2(sum(ecosystems, (e) => e.shareEur) - ecoCost),
      otherCost,
      net: round2(shareEur - ecoCost - otherCost),
      problems: creators.filter((c) => c.problems.length).length,
    },
  };
}
