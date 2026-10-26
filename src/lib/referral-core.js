/**
 * «Porta un collega» — logica PURA del programma referral (26/10/2026).
 *
 * Niente KV, niente rete: funzioni deterministiche, provate da tests/referral.mjs.
 * Il lato server (KV, Infloww, inviti) sta in referral.js.
 *
 * Le regole sono quelle proposte da Nicholas il 26/10/2026, con i margini
 * misurati sul file Finance (nov 2025 → giu 2026, ~€12,3M di ricavi):
 * su $1 venduto (netto creator) all'agenzia restano ~€0,195 netti, quindi
 * il 5% del mese 1 vale ~22% del nostro utile su quell'operatore e il 2,5%
 * del mese 2 ~11%. Su $5-10k/mese il programma costa il 18-25% del netto dei
 * primi 3 mesi; dal mese 4 l'operatore rende al 100%.
 *
 * Base delle percentuali = venduto Infloww (Employee statistics, colonna
 * "Sales"), che è GIÀ netto creator: verificato il 26/10/2026 su settembre,
 * $1,69M Infloww vs $1,55M netti DM+tip nel warehouse (se fosse lordo
 * sarebbe ~$1,94M). Nessuna conversione lordo→netto.
 *
 * UN SOLO LIVELLO, per costruzione: ogni persona portata ha un solo referente
 * e si guadagna solo su chi porti tu, mai sulle persone portate da loro.
 * Su più livelli diventa vendita piramidale (vietata, L. 173/2005).
 *
 * Cambiare le regole = nuova `version` + commento qui: chi guadagna vede lo
 * storico dei propri premi, che non deve cambiare sotto i piedi. I premi già
 * pagati restano congelati all'importo del pagamento.
 */

export const REFERRAL_RULES = {
  version: "ref-1",
  storyEur: 50,            // 2 storie Instagram pubblicate entro 30 giorni, concordate con l'HR
  storiesRequired: 2,
  storyWindowDays: 30,
  firstShiftEur: 50,       // primo turno in chat dopo aver superato la formazione
  retentionEur: 100,       // per ognuno dei primi 3 mesi in cui la persona lavora davvero
  retentionMonths: 3,
  salesPct: [0.05, 0.025], // mese 1, mese 2 — sul venduto Infloww (netto creator)
  // se il primo turno cade dopo il 15 il mese 1 è il mese dopo, e i giorni di
  // rodaggio prima si sommano al mese 1 (anche loro sono apprendimento)
  lateStartDay: 15,
  // le provvigioni maturano in dollari (come i compensi operatori); per un
  // totale unico si mostrano anche in euro a questo cambio, dichiarato.
  // Media nov 2025 → giu 2026 dal foglio FX Rates del file Finance.
  usdToEur: 0.86,
};

const s = (v) => (v == null ? "" : String(v)).trim();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export function isIsoDate(v) {
  if (!DATE_RE.test(s(v))) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
/** "2027-02" → "febbraio 2027" (per i testi delle voci). */
export const monthWords = (m) => `${MESI[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const isMonth = (v) => MONTH_RE.test(s(v)) && Number(s(v).slice(5)) >= 1 && Number(s(v).slice(5)) <= 12;

/** "2026-10" + n mesi → "2026-11". */
export function addMonths(month, n) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}
export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Ultimo giorno del mese "YYYY-MM" → "YYYY-MM-DD". */
export function monthEnd(month) {
  return addDays(`${addMonths(month, 1)}-01`, -1);
}

/** Nome per confronto: minuscolo, senza accenti, spazi compattati. */
export function normName(v) {
  return s(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
export function normEmail(v) {
  const e = s(v).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/**
 * Mesi del percorso a partire dal primo turno.
 * month1 = mese del primo turno, o il mese dopo se il primo turno è dopo il giorno 15.
 * salesMonths1 = mesi il cui venduto conta per il mese 1 (con l'avvio tardivo anche il mese parziale).
 */
export function referralMonths(firstShiftAt, rules = REFERRAL_RULES) {
  if (!isIsoDate(firstShiftAt)) return null;
  const startMonth = firstShiftAt.slice(0, 7);
  const late = Number(firstShiftAt.slice(8, 10)) > rules.lateStartDay;
  const month1 = late ? addMonths(startMonth, 1) : startMonth;
  const months = Array.from({ length: rules.retentionMonths }, (_, i) => addMonths(month1, i));
  return { month1, months, late, salesMonths1: late ? [startMonth, month1] : [month1] };
}

// ── Validazione input ───────────────────────────────────────────────────────

export function validateReferrer(input = {}) {
  const name = s(input.name).slice(0, 120);
  if (!name) return { error: "Serve il nome di chi porta" };
  const rawEmail = s(input.email);
  const email = rawEmail ? normEmail(rawEmail) : null;
  if (rawEmail && !email) return { error: "Email non valida" };
  return { value: { name, email, phone: s(input.phone).slice(0, 40) || null, note: s(input.note).slice(0, 1000) || null } };
}

const optDate = (v, label) => {
  const x = s(v);
  if (!x) return { value: null };
  return isIsoDate(x) ? { value: x } : { error: `${label}: data non valida` };
};

export function validateRecruit(input = {}) {
  const name = s(input.name).slice(0, 120);
  if (!name) return { error: "Serve il nome della persona portata" };
  if (!s(input.referrerId)) return { error: "Scegli chi l'ha portata" };
  const out = {
    name,
    referrerId: s(input.referrerId),
    storyId: s(input.storyId) || null,
    hrPersonId: s(input.hrPersonId) || null,
    inflowwName: s(input.inflowwName).slice(0, 120) || null,
    note: s(input.note).slice(0, 1000) || null,
  };
  for (const [k, label] of [["interviewAt", "Colloquio"], ["trainingAt", "Formazione"], ["firstShiftAt", "Primo turno"], ["exitedAt", "Uscita"]]) {
    const r = optDate(input[k], label);
    if (r.error) return r;
    out[k] = r.value;
  }
  const tp = input.trainingPassed;
  out.trainingPassed = tp === true || tp === "true" ? true : tp === false || tp === "false" ? false : null;
  if (out.firstShiftAt && out.trainingPassed !== true) return { error: "Il primo turno si segna solo dopo la formazione superata" };
  if (out.trainingAt && out.interviewAt && out.trainingAt < out.interviewAt) return { error: "La formazione non può essere prima del colloquio" };
  if (out.firstShiftAt && out.trainingAt && out.firstShiftAt < out.trainingAt) return { error: "Il primo turno non può essere prima della formazione" };
  // override mensile dell'HR: { "2026-11": "ok" | "no" } — "no" = mese non valido (es. turni saltati)
  const ov = {};
  for (const [m, v] of Object.entries(input.monthOverrides || {})) if (isMonth(m) && (v === "ok" || v === "no")) ov[m] = v;
  out.monthOverrides = ov;
  return { value: out };
}

export function validateStory(input = {}) {
  if (!s(input.referrerId)) return { error: "Scegli chi pubblica le storie" };
  const agreed = s(input.agreedAt);
  if (!isIsoDate(agreed)) return { error: "Data di accordo non valida" };
  const pub = [];
  for (const d of Array.isArray(input.publishedAt) ? input.publishedAt : []) {
    const x = s(d);
    if (!x) continue;
    if (!isIsoDate(x)) return { error: "Data di pubblicazione non valida" };
    if (x < agreed) return { error: "Una storia non può essere pubblicata prima dell'accordo" };
    pub.push(x);
  }
  pub.sort();
  return { value: { referrerId: s(input.referrerId), agreedAt: agreed, publishedAt: pub.slice(0, 5), note: s(input.note).slice(0, 1000) || null } };
}

/**
 * La persona è già stata portata da qualcun altro? (un solo referente per persona)
 * Confronto per scheda HR, poi per nome. Restituisce il recruit in conflitto o null.
 */
export function findDuplicateRecruit(recruits = [], candidate = {}, selfId = null) {
  const n = normName(candidate.name);
  return recruits.find((r) => r.id !== selfId && (
    (candidate.hrPersonId && r.hrPersonId === candidate.hrPersonId) ||
    (n && normName(r.name) === n)
  )) || null;
}

// ── Maturazione dei premi ───────────────────────────────────────────────────
//
// Stati di una voce: "pagato" (congelato), "maturato" (da pagare),
// "in_corso" (mese aperto: la cifra cresce), "in_attesa" (step non ancora
// raggiunto), "perso" (non più raggiungibile: uscita, mese senza vendite,
// storie fuori tempo).

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

/** Premio storie (€50 quando sono pubblicate 2 storie entro 30 giorni dall'accordo). */
export function storyMilestone(story, { today, paid = {}, rules = REFERRAL_RULES } = {}) {
  const key = `story:${story.id}`;
  const dueBy = addDays(story.agreedAt, rules.storyWindowDays);
  const inTime = (story.publishedAt || []).filter((d) => d <= dueBy);
  const base = { key, kind: "story", label: `${rules.storiesRequired} storie Instagram`, storyId: story.id, dueBy, published: (story.publishedAt || []).length, amountEur: rules.storyEur };
  if (paid[key]) return { ...base, status: "pagato", amountEur: paid[key].amountEur, paidAt: paid[key].paidAt };
  if (inTime.length >= rules.storiesRequired) return { ...base, status: "maturato", unlockedAt: inTime[rules.storiesRequired - 1] };
  if (today > dueBy) return { ...base, status: "perso", why: `Servivano ${rules.storiesRequired} storie entro il ${dueBy}` };
  return { ...base, status: "in_attesa", why: `${inTime.length}/${rules.storiesRequired} storie, entro il ${dueBy}` };
}

/**
 * Tutte le voci di una persona portata.
 * salesByMonth: { "2026-11": 4321.5 } venduto Infloww della persona (null = dato assente).
 * currentMonth: mese in corso "YYYY-MM" (il mese aperto matura "in corso").
 */
export function recruitMilestones(recruit, { today, salesByMonth = {}, paid = {}, rules = REFERRAL_RULES } = {}) {
  const r = recruit;
  const out = [];
  const currentMonth = today.slice(0, 7);
  const exited = r.exitedAt || null;
  const pay = (key, m) => (paid[key] ? { ...m, status: "pagato", amountEur: paid[key].amountEur, amountUsd: paid[key].amountUsd ?? m.amountUsd ?? null, paidAt: paid[key].paidAt } : m);

  // 1) primo turno
  {
    const key = `${r.id}:first_shift`;
    let m = { key, kind: "first_shift", label: "Primo turno in chat", amountEur: rules.firstShiftEur };
    if (r.firstShiftAt && r.trainingPassed === true) m = { ...m, status: "maturato", unlockedAt: r.firstShiftAt };
    else if (r.trainingPassed === false) m = { ...m, status: "perso", why: "Formazione non superata" };
    else if (exited) m = { ...m, status: "perso", why: "Uscita prima del primo turno" };
    else m = { ...m, status: "in_attesa", why: r.trainingAt ? "Dopo la formazione, al primo turno" : "Dopo colloquio e formazione" };
    out.push(pay(key, m));
  }

  const mm = referralMonths(r.firstShiftAt, rules);
  const started = Boolean(mm && r.trainingPassed === true);
  const salesOf = (months) => {
    const vals = months.map((x) => salesByMonth[x]);
    if (vals.every((v) => v == null)) return null;
    return round2(vals.reduce((a, v) => a + (Number(v) || 0), 0));
  };

  // 2) provvigioni mese 1 e 2
  rules.salesPct.forEach((pct, i) => {
    const key = `${r.id}:commission_${i + 1}`;
    const label = `${String(pct * 100).replace(".", ",")}% sul venduto del mese ${i + 1}`;
    let m = { key, kind: "commission", monthIndex: i + 1, pct, label, amountEur: null, amountUsd: null };
    if (!started) {
      m = { ...m, status: r.trainingPassed === false || exited ? "perso" : "in_attesa", why: r.trainingPassed === false ? "Formazione non superata" : exited ? "Uscita prima del primo turno" : "Parte dal primo turno" };
      out.push(pay(key, m));
      return;
    }
    const month = mm.months[i];
    const salesMonths = i === 0 ? mm.salesMonths1 : [month];
    const sales = salesOf(salesMonths);
    const usd = sales == null ? null : round2(sales * pct);
    m = { ...m, month, salesMonths, salesUsd: sales, amountUsd: usd, amountEur: usd == null ? null : round2(usd * rules.usdToEur) };
    if (month > currentMonth) m = { ...m, status: "in_attesa", why: `Da ${monthWords(month)}` };
    else if (month === currentMonth) m = { ...m, status: "in_corso", why: sales == null ? "Il venduto del mese arriva con il prossimo aggiornamento Infloww" : "Mese in corso: la cifra cresce con le vendite" };
    else if (sales == null) m = { ...m, status: "in_attesa", why: "Venduto Infloww del mese non ancora importato" };
    else if (sales <= 0) m = { ...m, status: "perso", why: "Nessuna vendita nel mese" };
    else m = { ...m, status: "maturato", unlockedAt: monthEnd(month) };
    out.push(pay(key, m));
  });

  // 3) €100 per ognuno dei primi 3 mesi in cui la persona lavora davvero
  for (let i = 0; i < rules.retentionMonths; i++) {
    const key = `${r.id}:month_${i + 1}`;
    let m = { key, kind: "retention", monthIndex: i + 1, label: `Mese ${i + 1} in agenzia`, amountEur: rules.retentionEur };
    if (!started) {
      m = { ...m, status: r.trainingPassed === false || exited ? "perso" : "in_attesa", why: r.trainingPassed === false ? "Formazione non superata" : exited ? "Uscita prima del primo turno" : "Parte dal primo turno" };
      out.push(pay(key, m));
      continue;
    }
    const month = mm.months[i];
    const salesMonths = i === 0 ? mm.salesMonths1 : [month];
    const sales = salesOf(salesMonths);
    const ov = r.monthOverrides?.[month] || null;
    m = { ...m, month };
    if (exited && exited < monthEnd(month)) m = { ...m, status: "perso", why: `Uscita il ${exited}` };
    else if (ov === "no") m = { ...m, status: "perso", why: "Mese non valido (segnato dall'HR)" };
    else if (month >= currentMonth) m = { ...m, status: month === currentMonth ? "in_corso" : "in_attesa", why: month === currentMonth ? "Matura a fine mese se la persona lavora" : `Da ${monthWords(month)}` };
    else if (ov === "ok") m = { ...m, status: "maturato", unlockedAt: monthEnd(month) };
    else if (sales == null) m = { ...m, status: "in_attesa", why: "Venduto Infloww del mese non ancora importato" };
    else if (sales <= 0) m = { ...m, status: "perso", why: "Nessuna vendita nel mese" };
    else m = { ...m, status: "maturato", unlockedAt: monthEnd(month) };
    out.push(pay(key, m));
  }
  return out;
}

/** Tappe del percorso della persona portata, per la vista del referente. */
export function recruitSteps(r, milestones = [], { today } = {}) {
  const mm = referralMonths(r.firstShiftAt);
  const ret = milestones.filter((m) => m.kind === "retention");
  const steps = [
    { key: "referred", label: "Segnalata", done: true, at: r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : null },
    { key: "interview", label: "Colloquio", done: Boolean(r.interviewAt), at: r.interviewAt || null },
    { key: "training", label: "Formazione", done: r.trainingPassed === true, failed: r.trainingPassed === false, at: r.trainingAt || null },
    { key: "first_shift", label: "Primo turno", done: Boolean(r.firstShiftAt && r.trainingPassed === true), at: r.firstShiftAt || null },
    ...ret.map((m, i) => ({ key: m.key, label: `Mese ${i + 1}`, done: m.status === "maturato" || m.status === "pagato", failed: m.status === "perso", current: m.status === "in_corso", at: mm?.months[i] || null })),
  ];
  const next = steps.find((x) => !x.done && !x.failed);
  return { steps, next: r.exitedAt && r.exitedAt <= today ? null : next?.key || null };
}

/** Somme per stato. In euro (le provvigioni convertite al cambio dichiarato). */
export function summarize(milestones = []) {
  const t = { pagato: 0, maturato: 0, in_corso: 0, in_attesa: 0, perso: 0 };
  for (const m of milestones) {
    if (m.amountEur == null) continue;
    t[m.status] = round2((t[m.status] || 0) + m.amountEur);
  }
  // potenziale ancora sbloccabile = voci fisse in attesa (le provvigioni future non si stimano)
  return { ...t, guadagnato: round2(t.pagato + t.maturato) };
}

/**
 * Ritaglio per il referente: SOLO ciò che serve a vedere quanto sta guadagnando.
 * Niente note HR, niente link alla scheda HR, niente nome Infloww.
 */
export function referrerView(recruit, milestones, steps) {
  return {
    id: recruit.id,
    name: recruit.name,
    exited: Boolean(recruit.exitedAt),
    steps: steps.steps,
    next: steps.next,
    milestones: milestones.map((m) => ({
      key: m.key, kind: m.kind, label: m.label, status: m.status, why: m.why || null,
      amountEur: m.amountEur, amountUsd: m.amountUsd ?? null, salesUsd: m.salesUsd ?? null, salesMonths: m.salesMonths || null, pct: m.pct ?? null,
      month: m.month || null, unlockedAt: m.unlockedAt || null, paidAt: m.paidAt || null,
    })),
    totals: summarize(milestones),
  };
}

/** Venduto Infloww del mese per persona da righe ops_kpi (una riga per gruppo → si sommano). */
export function salesMapFromKpiRows(rows = []) {
  const out = {};
  for (const r of rows || []) {
    const name = s(r?.employee);
    if (!name) continue;
    out[name] = round2((out[name] || 0) + (Number(r.sales) || 0));
  }
  return out;
}

/**
 * Venduto di una persona in una mappa {nome: venduto} di un mese importato:
 * match per nome normalizzato UNIVOCO, mai approssimato. Mese non importato
 * (map null) o nome ambiguo → null; nome assente da un mese importato → 0
 * (quel mese non ha venduto). Il nome lo sceglie l'HR dall'elenco Infloww.
 */
export function salesFor(map, inflowwName) {
  if (!map || !inflowwName) return null;
  if (Object.prototype.hasOwnProperty.call(map, inflowwName)) return map[inflowwName];
  const t = normName(inflowwName);
  const hits = Object.keys(map).filter((k) => normName(k) === t);
  if (hits.length > 1) return null;
  return hits.length === 1 ? map[hits[0]] : 0;
}
