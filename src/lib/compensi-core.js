/**
 * Compensi team — logica pura (15/10/2026, Nicholas).
 *
 * Il foglio "Compensi Team" (un tab per mese, blocchi per squadra, una riga per
 * persona×mansione) portato in HOC Pro. Qui SOLO calcoli, niente KV né rete:
 * testato in tests/compensi.mjs.
 *
 * Due modi di essere pagati:
 *  - "fisso": importo in euro;
 *  - "gamification": minimo garantito in euro OPPURE una percentuale sulle
 *    revenue (in DOLLARI) dei progetti indicati, convertita in euro al tasso del
 *    mese — si prende la cifra più alta. Le percentuali possono essere a
 *    scaglioni (es. >100K 2,5%, >150K 3%: si applica la percentuale dello
 *    scaglione più alto raggiunto, su TUTTA la revenue — è come lavorava il foglio
 *    "Calcolo": 158.265,69$ × 3% = 4.748$ → 3.988€).
 *    Ordine delle operazioni come chiesto: percentuale sul dollaro, POI cambio.
 * In più, per entrambi: voci extra (bonus, trattenute negative, rimborsi).
 *
 * Una persona con più righe (più progetti o più mansioni) si paga con UNA voce:
 * `byPerson` somma le righe con la stessa chiave persona.
 */

export const METHODS = ["fisso", "gamification"];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  // "1.234,56" / "1234,56" / "1,234.56" / "4014,03"
  let s = String(v).replace(/[€$\s%]/g, "");
  if (/^-?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
export const toNumber = num;

/** Chiave persona: stesso nome = stessa persona (spazi, maiuscole, accenti e note tra parentesi ignorati). */
export function personKey(name) {
  return String(name || "")
    .replace(/\(.*?\)/g, " ")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Mese "YYYY-MM" valido. */
export const isMonthId = (m) => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export function nextMonthId(m) {
  const [y, mm] = m.split("-").map(Number);
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export function monthLabel(m) {
  if (!isMonthId(m)) return m;
  const [y, mm] = m.split("-").map(Number);
  return `${MESI[mm - 1]} ${y}`;
}

/** Normalizza gli scaglioni: [{fromUsd, pct}] ordinati, pct in frazione (0.025). Accetta pct "2,5" o "2.5%" come percento. */
export function normalizeTiers(tiers) {
  return (Array.isArray(tiers) ? tiers : [])
    .map((t) => {
      // "2,5%" (testo col simbolo) = sempre percento; numero > 1 = percento scritto senza simbolo; altrimenti frazione
      const asPercent = typeof t?.pct === "string" && t.pct.includes("%");
      let pct = typeof t?.pct === "number" ? t.pct : num(String(t?.pct ?? "").replace("%", ""));
      if (asPercent || pct > 1) pct = pct / 100;
      return { fromUsd: Math.max(0, num(t?.fromUsd)), pct: Math.round(pct * 1e6) / 1e6 };
    })
    .filter((t) => t.pct > 0)
    .sort((a, b) => a.fromUsd - b.fromUsd);
}

/** La percentuale che si applica a questa revenue: lo scaglione più alto con revenue > soglia (soglia 0 = sempre). */
export function tierFor(tiers, revenueUsd) {
  let hit = null;
  for (const t of normalizeTiers(tiers)) {
    if (t.fromUsd === 0 ? revenueUsd > 0 : revenueUsd > t.fromUsd) hit = t;
  }
  return hit;
}

/** Revenue totale in dollari dei progetti nominati (nomi confrontati senza maiuscole/spazi). */
export function revenueFor(projects, revenues) {
  const want = new Set((projects || []).map(personKey).filter(Boolean));
  let usd = 0;
  const found = [];
  for (const r of revenues || []) {
    if (want.has(personKey(r.name))) { usd += num(r.usd); found.push(personKey(r.name)); }
  }
  const missing = [...want].filter((k) => !found.includes(k));
  return { usd: round2(usd), missing };
}

/**
 * Calcolo di una riga.
 * @returns {{ baseEur, extrasEur, totalEur, applied: "fisso"|"minimo"|"variabile"|"nessuno", detail }}
 */
export function computeLine(line, ctx = {}) {
  const extrasEur = round2((line?.extras || []).reduce((s, x) => s + num(x?.eur), 0));
  if (line?.method === "gamification") {
    const rule = line.rule || {};
    const fx = num(ctx.fx);
    const minEur = num(rule.minEur);
    const { usd, missing } = revenueFor(rule.projects, ctx.revenues);
    const tier = tierFor(rule.tiers, usd);
    const variableUsd = tier ? round2(usd * tier.pct) : 0;
    const variableEur = fx > 0 ? round2(variableUsd * fx) : null;
    const problems = [];
    if (!(fx > 0)) problems.push("manca il tasso dollaro→euro del mese");
    if (!(rule.projects || []).length) problems.push("nessun progetto collegato");
    if (missing.length) problems.push(`revenue non inserita per: ${missing.join(", ")}`);
    const useVariable = variableEur !== null && variableEur > minEur;
    const baseEur = round2(useVariable ? variableEur : minEur);
    return {
      baseEur, extrasEur, totalEur: round2(baseEur + extrasEur),
      applied: useVariable ? "variabile" : minEur > 0 ? "minimo" : "nessuno",
      detail: { revenueUsd: usd, pct: tier?.pct ?? 0, tierFromUsd: tier?.fromUsd ?? null, variableUsd, variableEur, minEur, fx, problems },
    };
  }
  const baseEur = round2(num(line?.fixedEur));
  return { baseEur, extrasEur, totalEur: round2(baseEur + extrasEur), applied: "fisso", detail: { problems: [] } };
}

/** Tutte le righe calcolate + totali per squadra e per persona. */
export function computeMonth(doc) {
  const ctx = { fx: doc?.fx?.rate, revenues: doc?.revenues || [] };
  const lines = (doc?.lines || []).map((l) => ({ ...l, calc: computeLine(l, ctx) }));

  const teams = new Map();
  for (const l of lines) {
    const t = l.team || "Senza squadra";
    if (!teams.has(t)) teams.set(t, { team: t, totalEur: 0, lines: [] });
    const g = teams.get(t);
    g.lines.push(l);
    g.totalEur = round2(g.totalEur + l.calc.totalEur);
  }

  const people = new Map();
  for (const l of lines) {
    const k = personKey(l.person);
    if (!k) continue;
    if (!people.has(k)) people.set(k, { key: k, person: l.person, totalEur: 0, lines: [], paid: true, teams: new Set(), mansioni: new Set() });
    const p = people.get(k);
    p.lines.push(l);
    p.totalEur = round2(p.totalEur + l.calc.totalEur);
    p.paid = p.paid && Boolean(l.paid);
    if (l.team) p.teams.add(l.team);
    if (l.mansione) p.mansioni.add(l.mansione);
  }

  const byPerson = [...people.values()].map((p) => ({ ...p, teams: [...p.teams], mansioni: [...p.mansioni] }))
    .sort((a, b) => b.totalEur - a.totalEur);
  const totalEur = round2(lines.reduce((s, l) => s + l.calc.totalEur, 0));
  const paidEur = round2(byPerson.filter((p) => p.paid).reduce((s, p) => s + p.totalEur, 0));
  const problems = lines.filter((l) => l.calc.detail.problems?.length).length;
  return { lines, byTeam: [...teams.values()], byPerson, totals: { totalEur, paidEur, toPayEur: round2(totalEur - paidEur), people: byPerson.length, lines: lines.length, problems } };
}

/** Il mese dopo: stesse righe e regole, "pagato" azzerato, extra e note del mese tolte; revenue e tasso da reinserire. */
export function cloneForNextMonth(doc, newMonth, newId) {
  return {
    month: newMonth,
    fx: { rate: null, source: null },
    revenues: (doc?.revenues || []).map((r) => ({ name: r.name, usd: null })),
    lines: (doc?.lines || []).map((l) => ({ ...l, id: newId(), paid: false, extras: [], note: l.keepNote ? l.note : "" })),
    clonedFrom: doc?.month || null,
  };
}

/** Pulizia di una riga che arriva dal client: solo i campi noti, tipi forzati. */
export function sanitizeLine(l, newId) {
  const method = METHODS.includes(l?.method) ? l.method : "fisso";
  const str = (v, max = 200) => String(v ?? "").slice(0, max).trim();
  const out = {
    id: /^[a-z0-9_-]{4,40}$/i.test(l?.id || "") ? l.id : newId(),
    team: str(l?.team, 120),
    mansione: str(l?.mansione, 120),
    person: str(l?.person, 120),
    projects: str(l?.projects, 300), // su chi lavora (testo libero, come la colonna Project del foglio)
    method,
    fixedEur: method === "fisso" ? round2(num(l?.fixedEur)) : null,
    rule: method === "gamification" ? {
      minEur: round2(num(l?.rule?.minEur)),
      tiers: normalizeTiers(l?.rule?.tiers),
      projects: (Array.isArray(l?.rule?.projects) ? l.rule.projects : []).map((p) => str(p, 120)).filter(Boolean).slice(0, 30),
    } : null,
    extras: (Array.isArray(l?.extras) ? l.extras : []).slice(0, 10)
      .map((x) => ({ label: str(x?.label, 120), eur: round2(num(x?.eur)) }))
      .filter((x) => x.label || x.eur),
    paid: Boolean(l?.paid),
    note: str(l?.note, 500),
    keepNote: Boolean(l?.keepNote),
  };
  if (l?.ruleDraft && typeof l.ruleDraft === "object") {
    out.ruleDraft = { minEur: round2(num(l.ruleDraft.minEur)), tiers: normalizeTiers(l.ruleDraft.tiers), source: str(l.ruleDraft.source, 200) };
  }
  return out;
}

export function sanitizeRevenues(list) {
  return (Array.isArray(list) ? list : []).slice(0, 200)
    .map((r) => ({ name: String(r?.name ?? "").slice(0, 120).trim(), usd: r?.usd === null || r?.usd === "" ? null : round2(num(r?.usd)) }))
    .filter((r) => r.name);
}

/**
 * Stessa persona scritta in due modi? Esatto, oppure tutte le parole del nome più corto
 * (almeno 2) stanno nel più lungo: "Marco Bove" = "Salvatore Marco Bove",
 * "Luis Aguilar" = "Luis Fernando Aguilar Escobar". Solo per l'INCROCIO col CRM (suggerimento),
 * mai per sommare righe: lì vale personKey esatta.
 */
export function namesMatch(a, b) {
  const ka = personKey(a), kb = personKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return "esatto";
  const ta = ka.split(" "), tb = kb.split(" ");
  const [s, l] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  return s.length >= 2 && s.every((w) => l.has(w)) ? "simile" : false;
}
