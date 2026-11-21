/**
 * Export dei Conti dell'impresa (21/11/2026, Gaia: «per i netti reali di ogni progetto e totali
 * abbiamo un foglio? Mi serve sempre per Claude»). Il Quadro si guardava e basta: qui diventa un
 * file da dare a un foglio o a Claude, con gli STESSI numeri della pagina (stessa computeQuadro).
 *
 * Logica pura (niente xlsx qui): restituisce i fogli come righe (array di array) + formati delle
 * colonne; la pagina li scrive in .xlsx con SheetJS caricato al click. Testata in
 * tests/quadro-export.mjs.
 *
 * Regola di quadratura: per ogni mese, righe creator + riga «Struttura e spese generali» = riga
 * TOTALE = utile del Quadro. La riga generale è la DIFFERENZA tra il totale e le creator, voce per
 * voce, così qualunque costo non attribuito (team senza creator, accordi senza team, extra
 * d'agenzia, spese generali) finisce lì e niente si perde.
 */
import { monthLabel } from "./compensi-core.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (arr, f) => round2(arr.reduce((s, x) => s + (Number(f(x)) || 0), 0));
const ratio = (a, b) => (b > 0 ? a / b : null);

export const GENERAL_ROW = "Struttura e spese generali";
export const TOTAL_ROW = "TOTALE";

const statoOf = (m, today) => (m.partial ? `in corso (fino al ${String(today || "").slice(8, 10)}/${String(today || "").slice(5, 7)})` : "chiuso");

/**
 * Righe per progetto di un mese del quadro: una per creator, la riga generale e il totale.
 * Ogni riga: { kind: "creator"|"generale"|"totale", name, manager, revenueUsd, quotaPct, feeEur,
 * staffEur, chatterEur, extrasEur, speseEur, costEur, nettoEur, marginPct, note }.
 */
export function projectRows(qm) {
  const teamById = new Map((qm.calc?.teams || []).map((t) => [t.id, t]));
  const creators = qm.creators.map((c) => {
    const t = teamById.get(c.id) || {};
    const staffEur = round2(t.staffEur), chatterEur = round2(t.chatterEur), extrasEur = round2(t.extrasEur), speseEur = round2(c.speseEur);
    return {
      kind: "creator",
      name: c.name,
      manager: c.manager || "",
      revenueUsd: c.revenueUsd ?? null,
      quotaPct: c.revenueUsd > 0 ? ratio(t.feeUsd || 0, c.revenueUsd) : null,
      feeEur: round2(c.feeEur),
      staffEur, chatterEur, extrasEur, speseEur,
      costEur: round2(c.costEur),
      nettoEur: round2(c.utileEur),
      marginPct: ratio(c.utileEur, c.feeEur),
      note: (c.problems || []).join("; "),
    };
  });
  const total = {
    kind: "totale",
    name: TOTAL_ROW,
    manager: "",
    revenueUsd: qm.revenueUsd ?? null,
    quotaPct: null,
    feeEur: round2(qm.feeEur),
    staffEur: round2(qm.staffEur),
    chatterEur: round2(qm.chatterEur),
    extrasEur: round2(qm.extrasEur),
    speseEur: round2(qm.speseEur),
    costEur: round2(qm.costEur),
    nettoEur: round2(qm.utileEur),
    marginPct: qm.marginPct ?? ratio(qm.utileEur, qm.feeEur),
    note: qm.problems ? `${qm.problems} creator con dati mancanti` : "",
  };
  const diff = (k) => round2(total[k] - sum(creators, (r) => r[k]));
  const general = {
    kind: "generale",
    name: GENERAL_ROW,
    manager: "",
    revenueUsd: null,
    quotaPct: null,
    feeEur: diff("feeEur"),
    staffEur: diff("staffEur"),
    chatterEur: diff("chatterEur"),
    extrasEur: diff("extrasEur"),
    speseEur: diff("speseEur"),
    costEur: diff("costEur"),
    nettoEur: diff("nettoEur"),
    marginPct: null,
    note: "costi che non stanno su nessuna creator: struttura, team senza creator, extra d'agenzia, spese generali",
  };
  return [...creators, general, total];
}

/** Netto per progetto sommato sui soli mesi CHIUSI (il mese in corso non è un netto reale). */
export function projectTotals(quadro) {
  const closed = quadro.months.filter((m) => !m.partial);
  const by = new Map();
  for (const m of closed) {
    for (const r of projectRows(m)) {
      if (r.kind === "totale") continue;
      const k = r.kind === "generale" ? GENERAL_ROW : r.name;
      if (!by.has(k)) by.set(k, { kind: r.kind, name: k, months: 0, revenueUsd: 0, feeEur: 0, costEur: 0, nettoEur: 0 });
      const a = by.get(k);
      a.months += 1;
      a.revenueUsd = round2(a.revenueUsd + (r.revenueUsd || 0));
      a.feeEur = round2(a.feeEur + r.feeEur);
      a.costEur = round2(a.costEur + r.costEur);
      a.nettoEur = round2(a.nettoEur + r.nettoEur);
    }
  }
  const rows = [...by.values()].map((a) => ({ ...a, revenueUsd: a.kind === "generale" ? null : a.revenueUsd, marginPct: a.kind === "generale" ? null : ratio(a.nettoEur, a.feeEur) }));
  const creators = rows.filter((r) => r.kind === "creator").sort((a, b) => b.nettoEur - a.nettoEur);
  const general = rows.filter((r) => r.kind === "generale");
  const all = [...creators, ...general];
  const total = {
    kind: "totale", name: TOTAL_ROW, months: closed.length,
    revenueUsd: sum(creators, (r) => r.revenueUsd), feeEur: sum(all, (r) => r.feeEur), costEur: sum(all, (r) => r.costEur), nettoEur: sum(all, (r) => r.nettoEur),
  };
  total.marginPct = ratio(total.nettoEur, total.feeEur);
  return { rows: [...all, total], closedMonths: closed.map((m) => m.month) };
}

const FMT = { eur: "#,##0 €;-#,##0 €", usd: "$#,##0;-$#,##0", pct: "0%", fx: "0.0000" };

/**
 * I fogli del file. Ogni foglio: { name, rows (array di array, prima riga = intestazione),
 * formats: { indiceColonna: formato }, widths: [caratteri per colonna] }.
 */
export function buildQuadroExport(quadro, { today } = {}) {
  const months = quadro.months;
  const closed = months.filter((m) => !m.partial);
  const partial = months.filter((m) => m.partial);

  // ── Per progetto (formato lungo: una riga per mese × progetto) ──
  const H1 = ["Mese", "Stato", "Progetto", "Sales manager", "Venduto $", "Quota HOC", "Cambio $→€", "Entra a HOC €", "Persone €", "Operatori €", "Extra €", "Spese €", "Costi €", "Netto €", "Margine", "Note"];
  const r1 = [H1];
  for (const m of [...months].reverse()) {
    for (const r of projectRows(m)) {
      r1.push([monthLabel(m.month), statoOf(m, today), r.name, r.manager, r.revenueUsd, r.quotaPct, m.fx ?? null, r.feeEur, r.staffEur, r.chatterEur, r.extrasEur, r.speseEur, r.costEur, r.nettoEur, r.marginPct, r.note]);
    }
  }

  // ── Mese per mese ──
  const H2 = ["Mese", "Stato", "Venduto $", "Cambio $→€", "Entra a HOC €", "Persone €", "Operatori €", "Extra €", "Spese €", "Costi €", "Utile €", "Margine"];
  const r2 = [H2, ...[...months].reverse().map((m) => [monthLabel(m.month), statoOf(m, today), m.revenueUsd, m.fx ?? null, m.feeEur, m.staffEur, m.chatterEur, m.extrasEur, m.speseEur, m.costEur, m.utileEur, m.marginPct])];

  // ── Totali per progetto (solo mesi chiusi) ──
  const pt = projectTotals(quadro);
  const H3 = ["Progetto", "Mesi chiusi", "Venduto $", "Entra a HOC €", "Costi €", "Netto €", "Margine"];
  const r3 = [H3, ...pt.rows.map((r) => [r.name, r.months, r.revenueUsd, r.feeEur, r.costEur, r.nettoEur, r.marginPct])];

  // ── Leggimi (contesto per chi legge, persona o Claude) ──
  const span = closed.length ? `${monthLabel(closed[0].month)} – ${monthLabel(closed[closed.length - 1].month)}` : "nessuno";
  const r0 = [
    ["Conti dell'impresa — netti per progetto"],
    [`Scaricato il ${String(today || "").split("-").reverse().join("/")} da HOC Pro (Contabilità → Conti dell'impresa). Stessi numeri della pagina.`],
    [],
    ["Perimetro", "Lo split di Nicholas: le creator del Conto dello split, non tutta HOC."],
    ["Mesi chiusi", `${closed.length} (${span})`],
    ["Mese in corso", partial.length ? `${partial.map((m) => monthLabel(m.month)).join(", ")}: parziale, non è un netto reale` : "nessuno"],
    ...(quadro.missing?.length ? [["Mesi mancanti", `${quadro.missing.map(monthLabel).join(", ")}: non sono nel conto, quindi non sono nei totali`]] : []),
    [],
    ["Fogli"],
    ["Per progetto", "Una riga per mese × progetto (creator), più «Struttura e spese generali» e «TOTALE» per ogni mese. Creator + generale = totale."],
    ["Mese per mese", "Il totale di ogni mese."],
    ["Totali per progetto", "Netto di ogni progetto sommato sui soli mesi chiusi."],
    [],
    ["Come si legge"],
    ["Venduto $", "Venduto netto della creator (dopo la quota OnlyFans), in dollari."],
    ["Quota HOC", "Quanto del venduto entra a HOC secondo l'accordo con la creator (con gli scaglioni è la quota effettiva del mese)."],
    ["Entra a HOC €", "Venduto × quota HOC, in euro al cambio del mese."],
    ["Persone €", "Accordi con le persone del progetto (sales manager, social, formazione, struttura)."],
    ["Operatori €", "Buste CreatorsPro degli operatori in chat, in euro al cambio del mese."],
    ["Extra €", "Costi extra del mese segnati nel Conto dello split."],
    ["Spese €", "Registro spese: mensili intere, annuali un dodicesimo al mese, una tantum nel loro mese; quelle in comune con tutta HOC solo per la quota dello split."],
    ["Netto €", "Entra a HOC − costi. Nella riga TOTALE è l'utile del mese."],
    ["Margine", "Netto ÷ entra a HOC."],
    [],
    ["Attenzione"],
    ["Costi societari", "I costi della società non ancora nel registro spese (commercialista, fiduciari, struttura) non ci sono: finché mancano, il netto è più alto del vero."],
    ["Spese generali", "Non sono divise sulle creator: stanno tutte nella riga «Struttura e spese generali». Il netto di una creator è quindi prima delle spese generali."],
    ["Note", "Se una riga ha una nota (es. revenue o cambio mancanti), quel progetto conta zero in quel mese finché non si completa il Conto dello split."],
  ];

  const money = (cols, kind) => Object.fromEntries(cols.map((c) => [c, FMT[kind]]));
  return [
    { name: "Leggimi", rows: r0, formats: {}, widths: [18, 110] },
    { name: "Per progetto", rows: r1, formats: { 4: FMT.usd, 5: FMT.pct, 6: FMT.fx, ...money([7, 8, 9, 10, 11, 12, 13], "eur"), 14: FMT.pct }, widths: [14, 22, 26, 18, 12, 10, 10, 13, 11, 11, 9, 9, 11, 11, 9, 50] },
    { name: "Mese per mese", rows: r2, formats: { 2: FMT.usd, 3: FMT.fx, ...money([4, 5, 6, 7, 8, 9, 10], "eur"), 11: FMT.pct }, widths: [14, 22, 12, 10, 13, 11, 11, 9, 9, 11, 11, 9] },
    { name: "Totali per progetto", rows: r3, formats: { 2: FMT.usd, ...money([3, 4, 5], "eur"), 6: FMT.pct }, widths: [26, 11, 13, 13, 11, 11, 9] },
  ];
}

export const exportFileName = (today) => `conti-impresa-${String(today || "").slice(0, 10)}.xlsx`;
