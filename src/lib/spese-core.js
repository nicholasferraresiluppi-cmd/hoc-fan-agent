/**
 * Spese dell'impresa + Quadro (18/11/2026, Nicholas: «vorrei un quadro molto chiaro delle spese,
 * dei deal delle varie persone e creator, così da avere ampia visione su tutti i costi aziendali»).
 * Perimetro deciso da Nicholas: il SUO split.
 *
 * Il Conto dello split (split-core) sa già quanto entra dagli accordi creator e quanto costano le
 * persone e gli operatori. Mancavano le spese che non sono persone: software, servizi tecnici, AI,
 * pubblicità, consulenti, banca. Qui:
 *  - una SPESA è una voce del registro: fornitore, importo, valuta, ogni quanto (mese / anno / una
 *    tantum), da quando a quando, su quale creator pesa ("" = generale), che quota tocca allo split
 *    (una spesa in comune con tutta HOC — es. ClickUp — pesa solo per la parte nostra).
 *  - per ogni mese: mensile = importo pieno; annuale = un dodicesimo per mese (rateo: quanto costa
 *    davvero al mese, non quando esce il bonifico); una tantum = tutto nel mese di `from`.
 *  - il QUADRO di un mese = il netto del Conto (fee − persone − operatori − extra) − spese = UTILE.
 * Logica pura, testata in tests/spese.mjs.
 */
import { computeSplitMonth, activeIn } from "./split-core.js";
import { isMonthId, toNumber, monthLabel } from "./compensi-core.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const str = (v, max = 200) => String(v ?? "").slice(0, max).trim();
const okId = (v) => /^[a-z0-9_-]{4,40}$/i.test(v || "");
const optMonth = (v) => (isMonthId(v) ? v : null);
const fmtEur = (n) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n || 0);

export const CATEGORIES = [
  "Software e abbonamenti",
  "Tecnologia e dati",
  "Intelligenza artificiale",
  "Pubblicità e promozione",
  "Consulenti e legali",
  "Banca e pagamenti",
  "Contenuti e produzione",
  "Altro",
];
export const CADENCES = { mese: "ogni mese", anno: "ogni anno", una_tantum: "una volta" };

export function sanitizeExpense(x, newId) {
  const quota = x?.quota === null || x?.quota === undefined || x?.quota === "" ? 100 : toNumber(x.quota);
  return {
    id: okId(x?.id) ? x.id : newId(),
    vendor: str(x?.vendor, 120),
    what: str(x?.what, 200),
    category: CATEGORIES.includes(x?.category) ? x.category : "Altro",
    amount: round2(toNumber(x?.amount)),
    currency: x?.currency === "USD" ? "USD" : "EUR",
    cadence: Object.hasOwn(CADENCES, x?.cadence) ? x.cadence : "mese",
    from: optMonth(x?.from), to: optMonth(x?.to),
    teamId: okId(x?.teamId) ? x.teamId : "",                  // "" = generale (nessuna creator)
    quota: Math.min(100, Math.max(0, round2(quota))),         // % a carico dello split
    company: str(x?.company, 80),                             // società che paga/intesta
    payer: str(x?.payer, 80),                                 // chi la paga in pratica (Asja, carta …)
    confirmed: Boolean(x?.confirmed),                         // false = importo o voce da confermare
    note: str(x?.note, 500),
    source: str(x?.source, 300),                              // dove l'abbiamo trovata (ricevuta, fattura…)
  };
}

export function sanitizeExpenses(items, newId) {
  return (Array.isArray(items) ? items : []).slice(0, 400).map((x) => sanitizeExpense(x, newId)).filter((x) => x.vendor || x.what);
}

/** Quanto pesa una spesa nel mese `m`, in euro, già per la quota dello split. */
export function expenseInMonth(x, m, fx) {
  const problems = [];
  let gross = 0;
  if (x.cadence === "una_tantum") {
    if (!x.from) problems.push("manca il mese della spesa");
    else if (x.from === m) gross = x.amount;
  } else if (activeIn(x, m)) {
    gross = x.cadence === "anno" ? x.amount / 12 : x.amount;
  }
  if (!gross) return { eur: 0, active: false, problems };
  if (x.currency === "USD" && !(fx > 0)) problems.push("manca il cambio");
  const eurFull = x.currency === "USD" ? (fx > 0 ? gross * fx : 0) : gross;
  return { eur: round2(eurFull * (x.quota / 100)), eurFull: round2(eurFull), active: true, problems };
}

/** Le spese del mese, per categoria e per team. */
export function computeExpensesMonth(items, m, fx) {
  const lines = [];
  for (const x of items || []) {
    const r = expenseInMonth(x, m, fx);
    if (r.active) lines.push({ ...x, ...r });
  }
  const byCategory = new Map();
  const byTeam = {};
  for (const l of lines) {
    byCategory.set(l.category, round2((byCategory.get(l.category) || 0) + l.eur));
    const k = l.teamId || "";
    byTeam[k] = round2((byTeam[k] || 0) + l.eur);
  }
  return {
    lines: lines.sort((a, b) => b.eur - a.eur),
    totalEur: round2(lines.reduce((s, l) => s + l.eur, 0)),
    byCategory: [...byCategory.entries()].map(([category, eur]) => ({ category, eur })).sort((a, b) => b.eur - a.eur),
    byTeam,
    toConfirm: lines.filter((l) => !l.confirmed).length,
  };
}

/** Ruolo libero dell'accordo → gruppo leggibile per «dove vanno i soldi». */
export function roleGroup(role) {
  const r = String(role || "").toLowerCase();
  if (/sales manager|chatter manager/.test(r)) return "Sales manager";
  if (/smm|social|publisher|editor|adv/.test(r)) return "Social e contenuti";
  if (/formazion|formator|potenziator|colloqui/.test(r)) return "Formazione";
  return "Struttura e altri";
}

/**
 * Il quadro di più mesi.
 * @param config   accordi dello split { teams, people }
 * @param monthDocs { [YYYY-MM]: doc del mese del Conto }
 * @param expenses  registro spese (sanitizzato)
 * @param today     "YYYY-MM-DD" (iniettato: deterministico nei test)
 */
export function computeQuadro(config, monthDocs, expenses, today) {
  const curMonth = String(today || "").slice(0, 7);
  const ids = Object.keys(monthDocs || {}).filter(isMonthId).sort();
  let lastFx = null;
  const months = ids.map((m) => {
    const doc = monthDocs[m];
    const calc = computeSplitMonth(config, { ...doc, month: m });
    const fx = calc.fx || lastFx;
    if (calc.fx) lastFx = calc.fx;
    const exp = computeExpensesMonth(expenses, m, fx);
    const staffByGroup = new Map();
    for (const d of calc.deals) staffByGroup.set(roleGroup(d.role), round2((staffByGroup.get(roleGroup(d.role)) || 0) + d.cost.eur));
    const T = calc.totals;
    const utileEur = round2(T.netEur - exp.totalEur);
    // Per creator: netto del conto meno le spese che pesano su quella creator.
    const creators = calc.teams.filter((t) => t.creator).map((t) => {
      const speseEur = exp.byTeam[t.id] || 0;
      return { id: t.id, name: t.name, manager: t.manager, revenueUsd: t.revenueUsd, feeEur: t.feeEur, costEur: round2(t.costEur + speseEur), speseEur, utileEur: round2(t.netEur - speseEur), problems: t.problems };
    }).sort((a, b) => b.utileEur - a.utileEur);
    return {
      month: m,
      partial: m >= curMonth,
      fx,
      revenueUsd: T.revenueUsd,
      feeEur: T.feeEur,
      staffEur: T.staffEur,
      chatterEur: T.chatterEur,
      extrasEur: T.extrasEur,
      speseEur: exp.totalEur,
      costEur: round2(T.costEur + exp.totalEur),
      netContoEur: T.netEur,
      utileEur,
      marginPct: T.feeEur > 0 ? utileEur / T.feeEur : null,
      problems: T.problems,
      staffByGroup: [...staffByGroup.entries()].map(([group, eur]) => ({ group, eur })).sort((a, b) => b.eur - a.eur),
      expenses: exp,
      creators,
      calc,
    };
  });
  return { months, missing: missingMonths(ids, curMonth) };
}

/** Mesi che mancano tra il primo registrato e il mese in corso (compreso). */
export function missingMonths(ids, curMonth) {
  if (!ids.length || !isMonthId(curMonth)) return [];
  const have = new Set(ids);
  const out = [];
  let [y, mo] = ids[0].split("-").map(Number);
  for (let i = 0; i < 60; i++) {
    const m = `${y}-${String(mo).padStart(2, "0")}`;
    if (m > curMonth) break;
    if (!have.has(m)) out.push(m);
    mo++; if (mo > 12) { mo = 1; y++; }
  }
  return out;
}

/** Dove vanno i soldi di un mese del quadro: righe in euro, dalla più grande. */
export function moneyFlow(qm) {
  if (!qm) return [];
  const rows = [
    ...qm.staffByGroup.map((g) => ({ key: `p:${g.group}`, kind: "Persone", label: g.group, eur: g.eur })),
    { key: "chatter", kind: "Operatori", label: "Operatori in chat", eur: qm.chatterEur },
    ...qm.expenses.byCategory.map((c) => ({ key: `s:${c.category}`, kind: "Spese", label: c.category, eur: c.eur })),
  ];
  if (qm.extrasEur) rows.push({ key: "extra", kind: "Extra", label: "Extra del mese", eur: qm.extrasEur });
  return rows.filter((r) => r.eur > 0).map((r) => ({ ...r, share: qm.feeEur > 0 ? r.eur / qm.feeEur : null })).sort((a, b) => b.eur - a.eur);
}

/**
 * «Da sistemare»: incoerenze e cose aperte, ciascuna con il perché. Solo controlli
 * deterministici sui dati, niente giudizi.
 */
export function quadroChecks(config, quadro, expenses, today) {
  const out = [];
  const curMonth = String(today || "").slice(0, 7);
  const teamName = new Map((config?.teams || []).map((t) => [t.id, t.name]));
  if (quadro.missing.length) out.push({ id: "mesi", kind: "Mesi", title: `${quadro.missing.length === 1 ? "Manca un mese" : `Mancano ${quadro.missing.length} mesi`} nel conto`, detail: `${quadro.missing.map(monthLabel).join(", ")}: senza il mese chiuso, il quadro non sa quanto è entrato e quanto è costato.` });
  for (const d of config?.people || []) {
    if (d.to && d.to < curMonth) continue;
    if (/sales manager/i.test(d.role || "") && Number(d.fixedEur) > 0 && (d.tiers?.length || 0) > 0) {
      out.push({ id: `sm:${d.id}`, kind: "Accordi", title: `${d.person || "(da assegnare)"}: fisso e percentuale si sommano`, detail: `Accordo «${d.role}»: ${fmtEur(d.fixedEur)} fissi + percentuale. La regola dei sales manager è «vale il più alto tra minimo e percentuale», mai la somma.` });
    }
    if (!d.person) out.push({ id: `np:${d.id}`, kind: "Accordi", title: `Accordo «${d.role || "senza ruolo"}» senza persona`, detail: `Su ${(d.teamIds || []).map((i) => teamName.get(i) || "?").join(" + ") || "agenzia"}: conta nei costi ma non si sa chi lo prende.` });
  }
  for (const t of config?.teams || []) {
    if (t.creator && !(t.tiers?.length) && !(t.to && t.to < curMonth)) out.push({ id: `deal:${t.id}`, kind: "Accordi", title: `${t.name}: accordo con la creator non impostato`, detail: "Senza accordo la fee conta zero e il team sembra in perdita." });
  }
  const closed = [...quadro.months].reverse().find((m) => !m.partial);
  if (closed) {
    for (const c of closed.creators) if (c.utileEur < 0 && !c.problems.length) out.push({ id: `loss:${c.id}`, kind: "Creator", title: `${c.name} è in perdita a ${monthLabel(closed.month)}`, detail: `Entra ${fmtEur(c.feeEur)}, costa ${fmtEur(c.costEur)}: ${fmtEur(c.utileEur)}.` });
  }
  const toConfirm = (expenses || []).filter((x) => !x.confirmed && !(x.to && x.to < curMonth));
  if (toConfirm.length) out.push({ id: "spese", kind: "Spese", title: `${toConfirm.length} ${toConfirm.length === 1 ? "spesa da confermare" : "spese da confermare"}`, detail: (() => { const v = [...new Set(toConfirm.map((x) => x.vendor))]; return v.slice(0, 8).join(", ") + (v.length > 8 ? "…" : "") + ": importo o quota non verificati."; })() });
  const shared = (expenses || []).filter((x) => x.quota === 100 && /comune|tutta hoc/i.test(x.note || ""));
  for (const x of shared) out.push({ id: `quota:${x.id}`, kind: "Spese", title: `${x.vendor}: spesa in comune contata al 100%`, detail: "La nota dice che è in comune con tutta HOC: va messa la quota dello split." });
  return out;
}
