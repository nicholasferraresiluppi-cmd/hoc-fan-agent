// Confronto creator (15/10/2026) — la riga di lettura sotto ogni creator.
// Regole fisse, niente AI: ogni frase confronta UN numero vero della riga con la mediana del gruppo mostrato
// (stesse righe della tabella: per creator o per pagina; in pagina si chiama "creator tipica") e lo cita. Si scrivono al massimo le 2 differenze più forti;
// se niente si discosta abbastanza, "In linea con il gruppo". Logica pura (la usano la lib server e i test).

// Sotto questi campioni un rapporto è rumore: la regola che lo usa tace (lezione MIN_PAIRS / SAMPLE_FLOORS).
export const MIN_PAYERS = 30;
export const MIN_NEW_SUBS = 50;
export const MIN_REACH = 1000;

const nf = (v, d = 0) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: d, minimumFractionDigits: 0, useGrouping: "always" }).format(v);
const money = (v) => `$${nf(Math.round(v))}`;
const pct = (v) => `${nf(v * 100, 1)}%`;
const pctInt = (v) => `${nf(Math.abs(v) * 100)}%`;

export function median(values) {
  const a = values.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** I rapporti che le regole leggono, già con i floor di campione applicati (null = non leggibile). */
export function ratiosOf(r) {
  return {
    eff: r.reach >= MIN_REACH && r.gross > 0 ? (r.gross / r.reach) * 1000 : null,
    arppu: r.payers >= MIN_PAYERS ? r.gross / r.payers : null,
    conv: r.ns_subs >= MIN_NEW_SUBS ? r.ns_conv / r.ns_subs : null,
    top10: r.payers >= MIN_PAYERS && r.fan_gross > 0 ? r.top10 / r.fan_gross : null,
  };
}

/** Mediane del gruppo, solo sulle righe con dati leggibili. */
export function groupMedians(rows) {
  const rs = rows.map(ratiosOf);
  return {
    eff: median(rs.map((x) => x.eff)),
    arppu: median(rs.map((x) => x.arppu)),
    conv: median(rs.map((x) => x.conv)),
    reach: median(rows.map((r) => r.reach)),
    payers: median(rows.map((r) => r.payers)),
  };
}

/** Le frasi candidate di una riga, ognuna con un peso (quanto si discosta); vince chi pesa di più. */
export function facts(r, med) {
  const x = ratiosOf(r);
  const out = [];
  const add = (w, text) => out.push({ w, text });
  if (x.eff != null && med.eff) {
    const k = x.eff / med.eff;
    if (k >= 1.5) add(k, `Il pubblico rende molto: ${money(x.eff)} ogni 1.000 di reach (tipica ${money(med.eff)}).`);
    else if (k <= 0.6 && r.reach >= med.reach) add(1 / k, `Tanto pubblico che rende poco: ${money(x.eff)} ogni 1.000 di reach (tipica ${money(med.eff)}).`);
  }
  if (x.arppu != null && med.arppu) {
    const k = x.arppu / med.arppu;
    if (k <= 0.75) add(1 / k, `Ogni fan pagante spende ${money(x.arppu)} (tipica ${money(med.arppu)}).`);
    else if (k >= 1.3) add(k, r.payers < med.payers ? `Pochi fan che spendono tanto: ${money(x.arppu)} a testa (tipica ${money(med.arppu)}).` : `I fan paganti spendono ${money(x.arppu)} a testa (tipica ${money(med.arppu)}).`);
  }
  if (x.conv != null && med.conv) {
    const k = x.conv / med.conv;
    const surge = Math.max(r.reach_delta ?? 0, r.clicks_delta ?? 0);
    if (k <= 0.7) add(1 / k + (surge >= 0.5 ? 0.3 : 0), surge >= 0.5
      ? `Traffico in forte crescita (+${pctInt(surge)}), ma paga solo il ${pct(x.conv)} dei nuovi (tipica ${pct(med.conv)}).`
      : `Paga solo il ${pct(x.conv)} dei nuovi (tipica ${pct(med.conv)}).`);
    else if (k >= 1.4) add(k, `Converte bene i nuovi: paga il ${pct(x.conv)} (tipica ${pct(med.conv)}).`);
  }
  if (x.top10 != null && x.top10 >= 0.25) add(1 + x.top10 * 2, `Dipende da pochi fan: il ${pct(x.top10)} del lordo da 10 fan.`);
  if (r.gross_delta != null && r.gross_prev >= 1000) {
    if (r.gross_delta <= -0.2) add(1 + Math.abs(r.gross_delta) * 2, `Lordo in calo del ${pctInt(r.gross_delta)}.`);
    else if (r.gross_delta >= 0.2) add(1 + r.gross_delta * 2, `Lordo in crescita del ${pctInt(r.gross_delta)}.`);
  }
  if (r.payers_delta != null && r.payers_prev >= MIN_PAYERS && r.payers_delta <= -0.2) add(1 + Math.abs(r.payers_delta) * 1.5, `Fan paganti in calo del ${pctInt(r.payers_delta)}.`);
  return out;
}

/** La riga di lettura: le 2 differenze più forti, oppure "In linea con il gruppo". */
export function letturaOf(r, med) {
  if (!(r.gross > 0)) return "Nessun incasso nel periodo.";
  const f = facts(r, med).sort((a, b) => b.w - a.w).slice(0, 2);
  return f.length ? f.map((x) => x.text).join(" ") : "In linea con il gruppo.";
}

/** Aggiunge `lettura` a ogni riga, con le mediane calcolate su queste stesse righe. */
export function withLettura(rows) {
  const med = groupMedians(rows.filter((r) => r.gross > 0));
  return { rows: rows.map((r) => ({ ...r, lettura: letturaOf(r, med) })), medians: med };
}
