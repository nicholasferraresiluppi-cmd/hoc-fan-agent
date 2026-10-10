// Diagnosi delle creator (v2 di Analisi vendite, 9/10/2026).
//
// PERCHÉ: la v1 copiava Looker (11 schede di tabelle per famiglia di metriche) e un sales manager
// doveva ricomporsi da solo il quadro di ogni creator. Qui si parte dalla domanda vera — "come vanno
// le mie creator, perché, chi guardo per prima" — e si risponde in parole.
//
// Logica pura (niente Node, niente KV): testata in tests/analisi-vendite-diagnosi.mjs.
//
// Il perché si legge come un albero:
//   revenue = fan che spendono × spesa a testa
//   fan che spendono ← nuovi abbonati × quanti di loro comprano (conversione) + fan già abbonati
// Si nomina la leva che si è mossa di più, con i numeri prima → dopo; poi i segnali di contorno
// (traffico dai link, chargeback). Sotto una soglia minima di dati non si giudica.

/** "Fishball - IT" → "Fishball" (stessa regola di creator-scope.personOf). */
export const personOf = (alias) => String(alias || "").replace(/\s*-\s*[A-Z]{2}\s*$/, "").trim();
/** "Fishball - IT" → "IT" ("" se l'alias non ha il mercato). */
export const marketOf = (alias) => (String(alias || "").match(/-\s*([A-Z]{2})\s*$/) || [])[1] || "";

const SUM_KEYS = [
  "revenue", "revenue_prev", "spenders", "spenders_prev", "transactions", "transactions_prev", "subs", "subs_prev",
  "conv_base", "conv", "conv_base_prev", "conv_prev", "clicks", "clicks_prev", "d0", "d0_subs", "d0_prev", "d0_subs_prev",
  "chargebacks", "chargeback_amount", "chargeback_amount_prev",
  "revenue_base", "base_missing", // livello normale (mediana 8 settimane prima); base_missing>0 = qualche account senza storia
];
// il fan che ha speso di più: tra gli account di una persona si prende il massimo, non la somma
const MAX_KEYS = ["top_fan", "top_fan_prev"];

// Soglie di giudizio (dichiarate, non magiche)
export const MIN_REVENUE_TO_JUDGE = 300; // sotto questa revenue nei due periodi non si dà un verdetto
const MOVE_PCT = 0.1; // ±10% = si è mosso
const MOVE_ABS = 300; // e almeno $300

const n = (v) => Number(v) || 0;
const ratio = (a, b) => (b ? a / b : null);
export const pctChange = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) : null);
const r2 = (x) => Math.round(x * 100) / 100;

/** Somma le righe per creator_id nelle PERSONE (una creator = tutti i suoi account). */
export function groupPersons(rows, names, daily = []) {
  const byPerson = new Map();
  for (const r of rows) {
    const alias = names[Number(r.creator_id)] || `Creator ${r.creator_id}`;
    const person = personOf(alias);
    if (!byPerson.has(person)) byPerson.set(person, { name: person, accounts: [], totals: Object.fromEntries([...SUM_KEYS, ...MAX_KEYS].map((k) => [k, 0])), daily: {} });
    const p = byPerson.get(person);
    p.accounts.push({ creator_id: Number(r.creator_id), alias, market: marketOf(alias), revenue: r2(n(r.revenue)), revenue_prev: r2(n(r.revenue_prev)) });
    for (const k of SUM_KEYS) p.totals[k] += n(r[k]);
    for (const k of MAX_KEYS) p.totals[k] = Math.max(p.totals[k], n(r[k]));
  }
  for (const d of daily) {
    const alias = names[Number(d.creator_id)];
    const p = byPerson.get(personOf(alias));
    if (p) p.daily[d.day] = (p.daily[d.day] || 0) + n(d.revenue);
  }
  return [...byPerson.values()];
}

/** I numeri leggibili di una persona: valori, prima, variazione. */
export function metricsOf(t) {
  const spend = ratio(t.revenue, t.spenders);
  const spendPrev = ratio(t.revenue_prev, t.spenders_prev);
  const cr = ratio(t.conv, t.conv_base);
  const crPrev = ratio(t.conv_prev, t.conv_base_prev);
  const d0 = ratio(t.d0, t.d0_subs);
  const d0Prev = ratio(t.d0_prev, t.d0_subs_prev);
  return {
    revenue: r2(t.revenue), revenue_prev: r2(t.revenue_prev), revenue_delta: pctChange(t.revenue, t.revenue_prev), revenue_diff: r2(t.revenue - t.revenue_prev),
    spenders: t.spenders, spenders_prev: t.spenders_prev, spenders_delta: pctChange(t.spenders, t.spenders_prev),
    spend_per_fan: spend == null ? null : r2(spend), spend_per_fan_prev: spendPrev == null ? null : r2(spendPrev), spend_per_fan_delta: spend != null && spendPrev ? pctChange(spend, spendPrev) : null,
    subs: t.subs, subs_prev: t.subs_prev, subs_delta: pctChange(t.subs, t.subs_prev),
    cr, cr_prev: crPrev,
    d0_per_sub: d0 == null ? null : r2(d0), d0_per_sub_prev: d0Prev == null ? null : r2(d0Prev),
    clicks: t.clicks, clicks_prev: t.clicks_prev, clicks_delta: pctChange(t.clicks, t.clicks_prev),
    chargebacks: t.chargebacks, chargeback_amount: r2(t.chargeback_amount), chargeback_amount_prev: r2(t.chargeback_amount_prev),
    top_fan: r2(n(t.top_fan)), top_fan_prev: r2(n(t.top_fan_prev)),
    // il livello normale vale solo se TUTTI gli account hanno 8 settimane di storia
    revenue_base: !n(t.base_missing) && n(t.revenue_base) > 0 ? r2(n(t.revenue_base)) : null,
    revenue_base_delta: !n(t.base_missing) && n(t.revenue_base) > 0 ? pctChange(t.revenue, t.revenue_base) : null,
  };
}

const money = (v) => `$${Math.round(v).toLocaleString("it-IT", { useGrouping: "always" })}`;
const int = (v) => Math.round(v).toLocaleString("it-IT", { useGrouping: "always" });
const pct = (v, d = 0) => `${(v * 100).toLocaleString("it-IT", { maximumFractionDigits: d, minimumFractionDigits: d })}%`;
const signed = (v) => `${v > 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))}%`;

// Il "periodo prima" è anomalo se si scosta di oltre il 20% dal livello normale della creator.
const ODD_PREV = 0.2;

/** Il periodo prima era un picco ("peak") o un buco ("dip") rispetto al solito? null se normale o se manca la storia. */
export function oddPrevOf(m) {
  if (!m.revenue_base || m.revenue_base < MIN_REVENUE_TO_JUDGE) return null;
  const d = pctChange(m.revenue_prev, m.revenue_base);
  if (d >= ODD_PREV) return "peak";
  if (d <= -ODD_PREV) return "dip";
  return null;
}

/** Stato: in calo / stabile / in crescita / pochi dati. */
export function statusOf(m) {
  if (Math.max(m.revenue, m.revenue_prev) < MIN_REVENUE_TO_JUDGE) return "pochi-dati";
  if (m.revenue_delta == null) return m.revenue > 0 ? "in-crescita" : "pochi-dati";
  const odd = oddPrevOf(m);
  if (m.revenue_delta <= -MOVE_PCT && m.revenue_diff <= -MOVE_ABS) {
    // dopo un picco, tornare al proprio livello normale non è un calo
    return odd === "peak" && m.revenue_base_delta > -MOVE_PCT ? "stabile" : "in-calo";
  }
  if (m.revenue_delta >= MOVE_PCT && m.revenue_diff >= MOVE_ABS) {
    return odd === "dip" && m.revenue_base_delta < MOVE_PCT ? "stabile" : "in-crescita";
  }
  return "stabile";
}

/**
 * Il perché, in frasi. La prima è la leva principale; le altre sono segnali di contorno.
 * Ogni frase: { kind, text } con kind = nodata | peak | dip | whale | spenders | spend | subs | conversion | traffic | chargeback | steady | data.
 */
export function reasonsOf(m) {
  const out = [];
  const st = statusOf(m);
  if (st === "pochi-dati") return [{ kind: "data", text: "Troppa poca revenue nei due periodi per dire come sta andando." }];
  // zero vendite dopo un periodo normale: quasi sempre un account scollegato o fermo, non un calo da spiegare
  if (m.revenue <= 0 && m.spenders === 0 && m.revenue_prev >= MIN_REVENUE_TO_JUDGE) {
    return [{ kind: "nodata", text: `Nessuna vendita registrata nel periodo (prima ${money(m.revenue_prev)}): controllare se l'account è ancora collegato o attivo prima di leggerlo come un calo.` }];
  }

  // 1. leva principale: quanti fan spendono o quanto spende ciascuno?
  const lnSp = m.spenders && m.spenders_prev ? Math.log(m.spenders / m.spenders_prev) : 0;
  const lnSpend = m.spend_per_fan && m.spend_per_fan_prev ? Math.log(m.spend_per_fan / m.spend_per_fan_prev) : 0;
  const moved = Math.abs(m.revenue_delta || 0) >= 0.05;
  if (moved && Math.abs(lnSp) >= Math.abs(lnSpend)) {
    out.push({
      kind: "spenders",
      text: `${lnSp < 0 ? "Meno" : "Più"} fan che spendono: ${int(m.spenders)} invece di ${int(m.spenders_prev)} (${signed(m.spenders_delta)}).`,
    });
    // perché sono cambiati i fan che spendono: arrivi o conversione?
    const crMove = m.cr != null && m.cr_prev ? (m.cr - m.cr_prev) / m.cr_prev : 0;
    const subsMove = m.subs_delta || 0;
    if (Math.abs(crMove) >= 0.15 && m.conv_base_ok !== false) {
      // "ma" solo quando arrivi e conversione vanno in direzioni opposte
      const buys = crMove < 0 ? "ne comprano di meno" : "ne comprano di più";
      const lead = subsMove >= 0.1 ? `Arrivano più nuovi abbonati${crMove < 0 ? ", ma" : " e"}`
        : subsMove <= -0.1 ? `Arrivano meno nuovi abbonati${crMove > 0 ? ", ma" : " e"}`
        : "Tra i nuovi abbonati";
      out.push({ kind: "conversion", text: `${lead} ${buys}: ${pct(m.cr, 1)} invece di ${pct(m.cr_prev, 1)}.` });
    } else if (Math.abs(subsMove) >= 0.15) {
      out.push({ kind: "subs", text: `${subsMove < 0 ? "Arrivano meno" : "Arrivano più"} nuovi abbonati: ${int(m.subs)} invece di ${int(m.subs_prev)} (${signed(subsMove)}).` });
    }
  } else if (moved) {
    out.push({
      kind: "spend",
      text: `Ogni fan spende ${lnSpend < 0 ? "meno" : "di più"}: ${money(m.spend_per_fan)} a testa invece di ${money(m.spend_per_fan_prev)} (${signed(m.spend_per_fan_delta)}).`,
    });
  } else {
    out.push({ kind: "steady", text: `Revenue in linea con il periodo prima (${money(m.revenue_prev)}).` });
  }

  // 1b. un solo fan pesa tanto? (con pochi fan una spesa grossa sposta tutto: va detto, non mascherato da "spesa a testa")
  const whalePrev = m.revenue_prev > 0 && m.top_fan_prev >= 0.35 * m.revenue_prev && m.top_fan_prev >= 300;
  const whaleNow = m.revenue > 0 && m.top_fan >= 0.35 * m.revenue && m.top_fan >= 300;
  if (whalePrev && m.revenue_delta < 0) {
    const without = pctChange(m.revenue, m.revenue_prev - m.top_fan_prev);
    out.splice(0, 0, { kind: "whale", text: `Nel periodo prima un fan da solo aveva speso ${money(m.top_fan_prev)} (${pct(m.top_fan_prev / m.revenue_prev)} dell'incasso)${without != null ? `: senza di lui la revenue sarebbe ${without >= 0 ? "cresciuta" : "calata"} del ${pct(Math.abs(without))}` : ""}.` });
  } else if (whaleNow && m.revenue_delta > 0) {
    const without = pctChange(m.revenue - m.top_fan, m.revenue_prev);
    out.splice(0, 0, { kind: "whale", text: `Un fan da solo ha speso ${money(m.top_fan)} (${pct(m.top_fan / m.revenue)} dell'incasso)${without != null ? `: senza di lui la revenue sarebbe ${without >= 0 ? "cresciuta" : "calata"} del ${pct(Math.abs(without))}` : ""}.` });
  }

  // 1c. il confronto inganna se il periodo prima era fuori dal solito: si dice per primo
  const odd = oddPrevOf(m);
  if ((odd === "peak" && m.revenue_delta < 0) || (odd === "dip" && m.revenue_delta > 0)) {
    const bd = m.revenue_base_delta;
    const vsNormal = Math.abs(bd) < 0.05 ? "in linea con il normale" : `${signed(bd)} rispetto al normale`;
    out.splice(0, 0, {
      kind: odd,
      text: `Il periodo prima era ${odd === "peak" ? "sopra" : "sotto"} il solito: ${money(m.revenue_prev)} contro un livello normale di ${money(m.revenue_base)} (mediana delle 8 settimane prima). Oggi è ${vsNormal}.`,
    });
  }

  // 2. segnali di contorno
  if (m.clicks_prev >= 200 && Math.abs(m.clicks_delta || 0) >= 0.25) {
    out.push({ kind: "traffic", text: `Traffico dai tracking link ${m.clicks_delta < 0 ? "in calo" : "in aumento"}: ${int(m.clicks)} click invece di ${int(m.clicks_prev)} (${signed(m.clicks_delta)}).` });
  }
  if (m.chargeback_amount >= 100 && m.chargeback_amount >= 2 * m.chargeback_amount_prev) {
    out.push({ kind: "chargeback", text: `Chargeback in aumento: ${money(m.chargeback_amount)} (${int(m.chargebacks)}) contro ${money(m.chargeback_amount_prev)} nel periodo prima.` });
  }
  return out;
}

const STATUS_ORDER = { "in-calo": 0, stabile: 1, "in-crescita": 2, "pochi-dati": 3 };

/** Persone pronte per la pagina, ordinate da chi perde più dollari. */
export function buildDiagnosi(rows, names, daily = [], days = []) {
  return groupPersons(rows, names, daily)
    .map((p) => {
      const m = metricsOf(p.totals);
      return {
        name: p.name,
        accounts: p.accounts.sort((a, b) => b.revenue - a.revenue),
        ids: p.accounts.map((a) => a.creator_id),
        status: statusOf(m),
        reasons: reasonsOf(m),
        metrics: m,
        daily: days.map((day) => ({ day, revenue: r2(p.daily[day] || 0) })),
      };
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.metrics.revenue_diff - b.metrics.revenue_diff || b.metrics.revenue - a.metrics.revenue);
}

/** Riassunto per l'intestazione: quante in calo/stabili/in crescita e il totale. */
export function summaryOf(persons) {
  const count = (s) => persons.filter((p) => p.status === s).length;
  const revenue = persons.reduce((a, p) => a + p.metrics.revenue, 0);
  const prev = persons.reduce((a, p) => a + p.metrics.revenue_prev, 0);
  return { down: count("in-calo"), steady: count("stabile"), up: count("in-crescita"), few: count("pochi-dati"), revenue: r2(revenue), revenue_prev: r2(prev), revenue_delta: pctChange(revenue, prev) };
}
