/**
 * «Porta un amico» — logica PURA del programma referral (26/10/2026).
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
 * ref-2 (26/10/2026, stesso giorno, decisione di Nicholas): i €100 non sono più
 * «al mese» ma «ogni 25 turni, fino a 75» — un premio legato ai turni fatti e
 * non al mese di calendario (tema finanza: non deve somigliare a una retribuzione
 * mensile). Turni = turni INIZIATI su CreatorsPro dal primo turno in poi (la
 * fonte dei turni dell'app); l'HR può scrivere il numero a mano se l'abbinamento
 * non riesce. Il cambio dollaro→euro delle provvigioni lo inserisce l'HR mese per
 * mese: senza cambio la provvigione resta in dollari e non si può pagare.
 *
 * ref-3 (26/10/2026, decisione di Nicholas): anche le percentuali vanno a
 * TURNI, non a mesi. 5% sul venduto dei primi 25 turni, 2,5% sul venduto dei
 * turni 26-50; ogni percentuale si sblocca SOLO quando la persona completa il
 * suo blocco di 25 turni. Chi non ci arriva (esce o viene mandato via) non
 * sblocca niente: il programma paga chi porta persone che restano, e una
 * reference sbagliata non si paga. Non è un giudizio sul lavoro della persona.
 * Infloww dà il venduto per MESE: il venduto di un blocco è la quota del venduto
 * Infloww di ogni mese pari ai turni del blocco fatti in quel mese sul totale
 * dei turni del mese (CreatorsPro solo come calendario, come Squadra/Fasce).
 * È una ripartizione dichiarata, non il venduto turno per turno.
 *
 * Cambiare le regole = nuova `version` + commento qui: chi guadagna vede lo
 * storico dei propri premi, che non deve cambiare sotto i piedi. I premi già
 * pagati restano congelati all'importo del pagamento.
 */
import { PHASE_EXITED } from "./hr-fields.js";

// ref-4 (29/10/2026): il programma è una PROVA e vale per chi scrive all'Area
// Partner (Claudia) entro il 30 novembre 2026 (decisione di Nicholas). Conta il
// giorno del primo contatto (`contactedAt`, se l'HR lo scrive; altrimenti il
// giorno in cui la persona è stata inserita): chi arriva dopo resta registrato,
// ma i suoi premi non maturano. Le storie concordate dopo la scadenza idem.
// Le persone e le storie entro la data non cambiano rispetto a ref-3.
export const REFERRAL_RULES = {
  version: "ref-4",
  campaignUntil: "2026-11-30", // ultimo giorno per scrivere all'Area Partner (null = nessuna scadenza)
  storyEur: 50,            // 2 storie Instagram pubblicate entro 30 giorni, concordate con l'HR
  storiesRequired: 2,
  storyWindowDays: 30,
  firstShiftEur: 50,       // primo turno in chat dopo aver superato la formazione
  shiftBonusEur: 100,      // ogni 25 turni fatti…
  shiftStep: 25,
  shiftMax: 75,            // …fino a 75 turni (3 premi)
  salesPct: [0.05, 0.025], // turni 1-25, turni 26-50 — sul venduto Infloww (netto creator)
  pctBlock: 25,            // ampiezza di un blocco di turni per le percentuali
  // le provvigioni maturano in dollari (come i compensi operatori); l'euro si
  // calcola col cambio del mese inserito dall'HR (referral:fx). Fuori da qui il
  // cambio è considerato sbagliato (errore di battitura, es. 86 invece di 0,86).
  fxMin: 0.5,
  fxMax: 1.5,
};

const romeDay = (ms) => (ms ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(ms)) : null);

/** Giorno del primo contatto con l'Area Partner: quello scritto dall'HR, altrimenti il giorno dell'inserimento. */
export function contactDay(r) {
  return r?.contactedAt || romeDay(r?.createdAt) || null;
}

/** La persona rientra nella prova? (senza data = sì: non si toglie un premio per un dato mancante) */
export function inCampaign(r, rules = REFERRAL_RULES) {
  const d = contactDay(r);
  return !rules.campaignUntil || !d || d <= rules.campaignUntil;
}

const itDay = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/** Cambio inserito dall'HR: numero tra fxMin e fxMax (accetta la virgola), o null. */
export function parseFx(v, rules = REFERRAL_RULES) {
  const x = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(x) && x >= rules.fxMin && x <= rules.fxMax ? Math.round(x * 10000) / 10000 : null;
}

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

/** Mesi "YYYY-MM" dal primo turno a oggi (massimo 12), per leggere venduto e turni. */
export function monthsSince(firstShiftAt, today, max = 12) {
  if (!isIsoDate(firstShiftAt) || !today) return [];
  const out = [];
  for (let m = firstShiftAt.slice(0, 7); m <= today.slice(0, 7) && out.length < max; m = addMonths(m, 1)) out.push(m);
  return out;
}

/**
 * Venduto di un blocco di turni (indici [from, to) nelle date ordinate):
 * per ogni mese, venduto Infloww del mese × turni del blocco nel mese ÷ turni
 * della persona nel mese. null se manca il venduto di un mese che serve.
 */
export function blockSales(dates, from, to, salesByMonth) {
  const all = {};
  for (const d of dates) all[d.slice(0, 7)] = (all[d.slice(0, 7)] || 0) + 1;
  const inBlock = {};
  for (const d of dates.slice(from, to)) inBlock[d.slice(0, 7)] = (inBlock[d.slice(0, 7)] || 0) + 1;
  let sum = 0;
  const months = Object.keys(inBlock).sort();
  for (const m of months) {
    const s = salesByMonth[m];
    if (s == null) return { sales: null, months };
    sum += (Number(s) || 0) * (inBlock[m] / all[m]);
  }
  return { sales: Math.round(sum * 100) / 100, months };
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
    note: s(input.note).slice(0, 1000) || null,
  };
  for (const [k, label] of [["contactedAt", "Primo contatto"], ["interviewAt", "Colloquio"], ["trainingAt", "Formazione"], ["firstShiftAt", "Primo turno"], ["exitedAt", "Uscita"]]) {
    const r = optDate(input[k], label);
    if (r.error) return r;
    out[k] = r.value;
  }
  const tri = (v) => (v === true || v === "true" ? true : v === false || v === "false" ? false : null);
  // esito del colloquio (07/11/2026): l'Area Partner scrive se la persona è passata o no
  out.interviewPassed = tri(input.interviewPassed);
  out.trainingPassed = tri(input.trainingPassed);
  if (out.interviewPassed === false && out.trainingPassed === true) return { error: "Con il colloquio non passato non c'è formazione superata" };
  if (out.firstShiftAt && out.trainingPassed !== true) return { error: "Il primo turno si segna solo dopo la formazione superata" };
  if (out.trainingAt && out.interviewAt && out.trainingAt < out.interviewAt) return { error: "La formazione non può essere prima del colloquio" };
  if (out.firstShiftAt && out.trainingAt && out.firstShiftAt < out.trainingAt) return { error: "Il primo turno non può essere prima della formazione" };
  // turni scritti a mano dall'HR (vince sul conteggio da CreatorsPro): vuoto = automatico
  const sm = s(input.shiftsManual);
  if (sm) {
    const x = Number(sm);
    if (!Number.isInteger(x) || x < 0 || x > 2000) return { error: "Turni fatti: un numero intero" };
    out.shiftsManual = x;
  } else out.shiftsManual = null;
  // venduto per blocco scritto a mano (serve solo quando i turni non vengono da CreatorsPro)
  out.blockSalesManual = [0, 1].map((i) => {
    const v = s(input.blockSalesManual?.[i]).replace(",", ".");
    const x = Number(v);
    return v && Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : null;
  });
  return { value: out };
}

// Storie: i passaggi che segue l'Area Partner (08/11/2026, dal suo tracciamento su
// ClickUp): proposte inviate → storie scelte → ok → pubblicate (screen) →
// visualizzazioni dopo 24 ore. Una scheda storie può nascere già alle proposte
// inviate, prima dell'accordo: il premio e i 30 giorni partono solo dall'ok.
// Le visualizzazioni si registrano ma NON condizionano il premio (regole ref-4).
export function validateStory(input = {}) {
  if (!s(input.referrerId)) return { error: "Scegli chi pubblica le storie" };
  const out = { referrerId: s(input.referrerId) };
  for (const [k, label] of [["sentAt", "Proposte inviate"], ["agreedAt", "Ok"]]) {
    const r = optDate(input[k], label);
    if (r.error) return r;
    out[k] = r.value;
  }
  if (!out.sentAt && !out.agreedAt) return { error: "Serve almeno il giorno in cui sono state inviate le proposte o quello dell'ok" };
  if (out.sentAt && out.agreedAt && out.agreedAt < out.sentAt) return { error: "L'ok non può essere prima dell'invio delle proposte" };
  out.chosen = s(input.chosen).slice(0, 80) || null;
  const pub = [];
  for (const d of Array.isArray(input.publishedAt) ? input.publishedAt : []) {
    const x = s(d);
    if (!x) continue;
    if (!isIsoDate(x)) return { error: "Data di pubblicazione non valida" };
    if (!out.agreedAt) return { error: "Prima della pubblicazione serve l'ok" };
    if (x < out.agreedAt) return { error: "Una storia non può essere pubblicata prima dell'ok" };
    pub.push(x);
  }
  pub.sort();
  out.publishedAt = pub.slice(0, 5);
  const rawViews = s(input.views).replace(/[.\s]/g, "");
  if (rawViews) {
    const v = Number(rawViews);
    if (!Number.isInteger(v) || v < 0 || v > 100000000) return { error: "Visualizzazioni: un numero intero" };
    if (!out.publishedAt.length) return { error: "Le visualizzazioni si segnano dopo la pubblicazione" };
    out.views = v;
  } else out.views = null;
  out.note = s(input.note).slice(0, 1000) || null;
  return { value: out };
}

/**
 * A che punto sono le storie (i passaggi dell'Area Partner), per la tabella e
 * il «cosa manca». Le visualizzazioni si chiedono 24 ore dopo l'ultima storia.
 */
export function storyStage(story, { today, rules = REFERRAL_RULES } = {}) {
  const pub = story?.publishedAt || [];
  if (!story?.agreedAt) {
    if (story?.chosen) return { key: "scelte", label: "Scelte, manca l'ok", step: 2 };
    return { key: "inviate", label: "Proposte inviate, da scegliere", step: 1 };
  }
  if (pub.length < rules.storiesRequired) return { key: "concordate", label: pub.length ? `${pub.length} su ${rules.storiesRequired} pubblicate` : "Ok dato, da pubblicare", step: 3 };
  if (story.views == null) {
    const due = addDays(pub[pub.length - 1], 1);
    return today && today > due
      ? { key: "visualizzazioni", label: "Visualizzazioni non arrivate", step: 4, late: true, viewsDue: due }
      : { key: "visualizzazioni", label: `Visualizzazioni attese il ${itDay(due)}`, step: 4, viewsDue: due };
  }
  return { key: "complete", label: "Complete", step: 5 };
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

// ── Collegamento al CRM (07/11/2026) ────────────────────────────────────────
//
// Prima la persona portata aveva un nome Infloww suo, scelto dall'HR qui, e le
// date di primo turno e uscita scritte a mano: un collegamento in più rispetto
// al resto dell'app. Ora si lega alla SCHEDA del CRM (`hrPersonId`) e da lì
// prende tutto: chi è su Infloww (collegamento persona→operatore della scheda,
// person-operator.js), da cui i turni CreatorsPro e il venduto; l'uscita dalla
// fase «Uscita» della scheda; il primo turno dai turni CreatorsPro. Una data
// scritta dall'HR qui vince sempre (correzione dei casi strani). Le regole dei
// premi non cambiano: cambia solo da dove arrivano i dati.

/**
 * Persona portata + la sua scheda CRM e il collegamento all'operatore:
 * `inflowwName` dal collegamento, `exitedAt` dalla scheda in fase «Uscita»
 * (giorno di fine collaborazione, altrimenti del cambio di fase, altrimenti oggi)
 * se qui non è scritta. `exitSource`: "manual" | "crm" | null.
 */
export function withCrm(r, { person = null, link = null, today = null } = {}) {
  const phase = person?.fields?.collaborationStatus || null;
  const out = { ...r, inflowwName: link?.inflowwName || null, crmPhase: phase, exitSource: r.exitedAt ? "manual" : null };
  if (!r.exitedAt && phase === PHASE_EXITED) {
    const at = person.fieldUpdatedAt?.collaborationStatus;
    out.exitedAt = person.fields.endDate || romeDay(at) || today;
    out.exitSource = "crm";
  }
  return out;
}

/** Da che giorno si cerca il primo turno: formazione, altrimenti colloquio, altrimenti primo contatto. */
export function firstShiftSearchFrom(r) {
  return r.trainingAt || r.interviewAt || contactDay(r) || null;
}

/**
 * Primo turno letto da CreatorsPro: il primo turno iniziato dal giorno della
 * formazione in poi, solo a formazione superata. La data scritta dall'HR vince.
 * `firstShiftSource`: "manual" | "cp" | null (non ancora visto).
 */
export function withFirstShift(r, shiftDates) {
  if (r.firstShiftAt) return { ...r, firstShiftSource: "manual" };
  if (r.trainingPassed !== true || !Array.isArray(shiftDates)) return { ...r, firstShiftSource: null };
  const from = firstShiftSearchFrom(r);
  const first = shiftDates.filter((d) => !from || d >= from).sort()[0] || null;
  return first ? { ...r, firstShiftAt: first, firstShiftSource: "cp" } : { ...r, firstShiftSource: null };
}

/**
 * Perché il percorso si è chiuso prima del primo turno: colloquio non passato
 * (07/11/2026) o formazione non superata. null se è ancora aperto.
 */
export function stopReason(r) {
  if (r?.interviewPassed === false) return "Non presa al colloquio";
  if (r?.trainingPassed === false) return "Formazione non superata";
  return null;
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
  if (!story.agreedAt) {
    // proposte inviate, ok non ancora dato: il premio e i 30 giorni non sono partiti
    const base0 = { key, kind: "story", label: `${rules.storiesRequired} storie Instagram`, storyId: story.id, dueBy: null, published: 0, amountEur: rules.storyEur };
    if (rules.campaignUntil && today > rules.campaignUntil) return { ...base0, status: "perso", outOfCampaign: true, why: `Ok non arrivato entro il ${itDay(rules.campaignUntil)}` };
    return { ...base0, status: "in_attesa", why: story.chosen ? "Storie scelte: in attesa dell'ok dell'Area Partner" : "Proposte inviate: storie da scegliere" };
  }
  const dueBy = addDays(story.agreedAt, rules.storyWindowDays);
  const inTime = (story.publishedAt || []).filter((d) => d <= dueBy);
  const base = { key, kind: "story", label: `${rules.storiesRequired} storie Instagram`, storyId: story.id, dueBy, published: (story.publishedAt || []).length, amountEur: rules.storyEur };
  if (paid[key]) return { ...base, status: "pagato", amountEur: paid[key].amountEur, paidAt: paid[key].paidAt };
  if (rules.campaignUntil && story.agreedAt > rules.campaignUntil) return { ...base, status: "perso", outOfCampaign: true, why: `Fuori dalla prova: storie concordate dopo il ${itDay(rules.campaignUntil)}` };
  if (inTime.length >= rules.storiesRequired) return { ...base, status: "maturato", unlockedAt: inTime[rules.storiesRequired - 1] };
  if (today > dueBy) return { ...base, status: "perso", why: `Servivano ${rules.storiesRequired} storie entro il ${dueBy}` };
  return { ...base, status: "in_attesa", why: `${inTime.length}/${rules.storiesRequired} storie, entro il ${dueBy}` };
}

/**
 * Tutte le voci di una persona portata.
 * salesByMonth: { "2026-11": 4321.5 } venduto Infloww della persona (null = dato assente).
 * shiftDates: date ("YYYY-MM-DD") dei turni iniziati su CreatorsPro, null = non letti.
 * fx: { "2026-11": 0.86 } cambio dollaro→euro del mese inserito dall'HR.
 */
export function recruitMilestones(recruit, { today, salesByMonth = {}, shiftDates = null, fx = {}, paid = {}, rules = REFERRAL_RULES } = {}) {
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
    else if (stopReason(r)) m = { ...m, status: "perso", why: stopReason(r) };
    else if (exited) m = { ...m, status: "perso", why: "Uscita prima del primo turno" };
    else m = { ...m, status: "in_attesa", why: r.trainingAt ? "Dopo la formazione, al primo turno" : "Dopo colloquio e formazione" };
    out.push(pay(key, m));
  }

  const started = Boolean(r.firstShiftAt && r.trainingPassed === true);
  const dates = Array.isArray(shiftDates) && started ? shiftDates.filter((d) => d >= r.firstShiftAt).sort() : null;
  const manual = Number.isInteger(r.shiftsManual) ? r.shiftsManual : null;
  const done = manual ?? (dates ? dates.length : null);

  // 2) percentuali: 5% sui turni 1-25, 2,5% sui turni 26-50, sbloccate a blocco completato
  rules.salesPct.forEach((pct, i) => {
    const key = `${r.id}:commission_${i + 1}`;
    const from = i * rules.pctBlock, to = (i + 1) * rules.pctBlock;
    const label = `${String(pct * 100).replace(".", ",")}% sul venduto dei turni ${from + 1}-${to}`;
    let m = { key, kind: "commission", block: i + 1, pct, label, amountEur: null, amountUsd: null, shiftsDone: done, shiftsTo: to };
    if (!started) {
      m = { ...m, status: stopReason(r) || exited ? "perso" : "in_attesa", why: stopReason(r) || (exited ? "Uscita prima del primo turno" : "Parte dal primo turno") };
      out.push(pay(key, m));
      return;
    }
    const reached = done != null && done >= to;
    // venduto del blocco: a mano se l'HR l'ha scritto, altrimenti ripartito dalle date dei turni
    const manualSales = r.blockSalesManual?.[i] ?? null;
    const bs = manualSales != null ? { sales: manualSales, months: [] } : manual == null && dates ? blockSales(dates, from, Math.min(to, dates.length), salesByMonth) : { sales: null, months: [] };
    const unlockDay = reached && manual == null && dates?.[to - 1] ? dates[to - 1] : null;
    const fxMonth = (unlockDay || today).slice(0, 7);
    const rate = fx?.[fxMonth] ?? null;
    const usd = bs.sales == null ? null : round2(bs.sales * pct);
    m = { ...m, salesUsd: bs.sales, salesMonths: bs.months, amountUsd: usd, month: fxMonth, fx: rate, fxMissing: usd != null && rate == null, amountEur: usd == null || rate == null ? null : round2(usd * rate) };
    if (!reached) {
      if (exited) m = { ...m, status: "perso", why: `Uscita dopo ${done ?? 0} turni: la percentuale si sblocca solo a ${to} turni` };
      else if (done == null) m = { ...m, status: "in_attesa", why: "Turni non ancora letti da CreatorsPro" };
      else if (done <= from) m = { ...m, status: "in_attesa", why: `Dal turno ${from + 1}` };
      else m = { ...m, status: "in_corso", why: `${done} turni su ${to}: si sblocca al ${to}°${usd != null ? ", la cifra cresce con le vendite" : ""}` };
    } else if (bs.sales == null) {
      m = { ...m, status: "in_attesa", why: manual != null ? "Con i turni scritti a mano serve anche il venduto del blocco (a mano)" : "Venduto Infloww di un mese non ancora importato" };
    } else if (bs.months.includes(currentMonth)) {
      // blocco finito nel mese in corso: il venduto Infloww del mese cresce ancora
      m = { ...m, status: "in_corso", why: `${to} turni fatti: la cifra si chiude a fine mese col venduto Infloww` };
    } else if (bs.sales <= 0) {
      m = { ...m, status: "perso", why: "Nessuna vendita nei turni del blocco" };
    } else {
      m = { ...m, status: "maturato", unlockedAt: unlockDay };
    }
    out.push(pay(key, m));
  });

  // 3) €100 ogni 25 turni, fino a 75 (si accumulano)
  for (let n = rules.shiftStep; n <= rules.shiftMax; n += rules.shiftStep) {
    const key = `${r.id}:shifts_${n}`;
    let m = { key, kind: "shifts", shifts: n, label: `${n} turni fatti`, amountEur: rules.shiftBonusEur, shiftsDone: done };
    if (!started) {
      m = { ...m, status: stopReason(r) || exited ? "perso" : "in_attesa", why: stopReason(r) || (exited ? "Uscita prima del primo turno" : "Parte dal primo turno") };
    } else if (done != null && done >= n) {
      // data del n-esimo turno quando la conosciamo (con il numero a mano no)
      m = { ...m, status: "maturato", unlockedAt: manual == null && dates?.[n - 1] ? dates[n - 1] : null };
    } else if (exited) {
      m = { ...m, status: "perso", why: `Uscita dopo ${done ?? 0} turni` };
    } else if (done == null) {
      m = { ...m, status: "in_attesa", why: "Turni non ancora letti da CreatorsPro" };
    } else {
      m = { ...m, status: "in_attesa", why: `${done} turni su ${n}` };
    }
    out.push(pay(key, m));
  }
  // fuori dalla prova: la persona resta registrata, ma niente matura (il già pagato resta)
  if (!inCampaign(r, rules)) {
    const why = `Fuori dalla prova: primo contatto il ${itDay(contactDay(r))}, la prova valeva fino al ${itDay(rules.campaignUntil)}`;
    return out.map((m) => (m.status === "pagato" ? m : { ...m, status: "perso", outOfCampaign: true, why }));
  }
  return out;
}

/** Tappe del percorso della persona portata, per la vista del referente. */
export function recruitSteps(r, milestones = [], { today } = {}) {
  const ret = milestones.filter((m) => m.kind === "shifts");
  const steps = [
    { key: "referred", label: "Segnalata", done: true, at: contactDay(r) },
    { key: "interview", label: "Colloquio", done: r.interviewPassed === true || (Boolean(r.interviewAt) && r.interviewPassed !== false), failed: r.interviewPassed === false, at: r.interviewAt || null },
    { key: "training", label: "Formazione", done: r.trainingPassed === true, failed: r.trainingPassed === false, at: r.trainingAt || null },
    { key: "first_shift", label: "Primo turno", done: Boolean(r.firstShiftAt && r.trainingPassed === true), at: r.firstShiftAt || null },
    ...ret.map((m) => ({ key: m.key, label: `${m.shifts} turni`, done: m.status === "maturato" || m.status === "pagato", failed: m.status === "perso", at: m.unlockedAt || null })),
  ];
  const next = steps.find((x) => !x.done && !x.failed);
  // formazione non superata o uscita: il percorso è chiuso, niente «prossima tappa»
  const closed = Boolean(stopReason(r)) || (r.exitedAt && r.exitedAt <= today);
  return { steps, next: closed ? null : next?.key || null, closedWhy: stopReason(r) || (closed ? "Uscita" : null) };
}

/**
 * Somme per stato, in euro. Le provvigioni senza il cambio del mese restano in
 * dollari: si sommano a parte (`senzaCambioUsd`, solo maturate e in corso).
 */
export function summarize(milestones = []) {
  const t = { pagato: 0, maturato: 0, in_corso: 0, in_attesa: 0, perso: 0 };
  let senzaCambioUsd = 0;
  for (const m of milestones) {
    if (m.amountEur == null) {
      if (m.amountUsd != null && (m.status === "maturato" || m.status === "in_corso")) senzaCambioUsd += m.amountUsd;
      continue;
    }
    t[m.status] = round2((t[m.status] || 0) + m.amountEur);
  }
  return { ...t, guadagnato: round2(t.pagato + t.maturato), senzaCambioUsd: round2(senzaCambioUsd) };
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
    outOfCampaign: !inCampaign(recruit),
    steps: steps.steps,
    next: steps.next,
    milestones: milestones.map((m) => ({
      key: m.key, kind: m.kind, label: m.label, status: m.status, why: m.why || null,
      amountEur: m.amountEur, amountUsd: m.amountUsd ?? null, salesUsd: m.salesUsd ?? null, salesMonths: m.salesMonths || null, pct: m.pct ?? null,
      fxMissing: Boolean(m.fxMissing), shifts: m.shifts ?? null, shiftsDone: m.shiftsDone ?? null, shiftsTo: m.shiftsTo ?? null,
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

/**
 * Date dei turni INIZIATI per persona da righe wage CP di un mese:
 * { nomeNormalizzato: ["YYYY-MM-DD", …] }. Nome = mapping CP→Infloww se c'è,
 * altrimenti il nome del membro CP. Giorno in ora di Roma.
 */
export function shiftDatesFromWages(wages = [], mapping = {}, nowMs = Date.now()) {
  const day = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(iso));
  const out = {};
  for (const w of wages || []) {
    const name = normName(mapping?.[w?.member_id] || w?.member_name);
    if (!name) continue;
    for (const sh of w.shifts || []) {
      const ts = Date.parse(sh?.started_at);
      if (!Number.isFinite(ts) || ts > nowMs) continue;
      (out[name] ||= []).push(day(ts));
    }
  }
  return out;
}


// ── Dashboard del programma (HR) ────────────────────────────────────────────
//
// Serve a capire la DIREZIONE: chi porta persone che restano e rendono, quanto
// rendono le storie, quanto costa il programma rispetto a quello che porta.
// Regole di onestà: sotto 3 persone «decise» (arrivate a 25 turni o uscite
// prima) la tenuta non si giudica; il venduto a turno si confronta solo su
// chi ha almeno 5 turni; l'utile è una STIMA dichiarata dal file Finance.

/** Margine netto agenzia sul venduto (file Finance nov 2025 → giu 2026: 22,7% del ricavo in €). */
export const NET_MARGIN_ON_SALES = 0.227;
const MIN_DECIDED = 3;
const MIN_SHIFTS_RATE = 5;

/** Numeri di una persona portata: turni, venduto da quando lavora, venduto a turno nei primi 25. */
export function recruitMetrics(r, { salesByMonth = {}, shiftDates = null, rules = REFERRAL_RULES } = {}) {
  const started = Boolean(r.firstShiftAt && r.trainingPassed === true);
  const dates = Array.isArray(shiftDates) && started ? shiftDates.filter((d) => d >= r.firstShiftAt).sort() : null;
  const manual = Number.isInteger(r.shiftsManual) ? r.shiftsManual : null;
  const done = started ? (manual ?? (dates ? dates.length : null)) : 0;
  const known = Object.values(salesByMonth).filter((v) => v != null);
  const salesTotal = started && known.length ? round2(known.reduce((a, v) => a + (Number(v) || 0), 0)) : null;
  let first25 = null;
  if (started && manual == null && dates && dates.length) {
    first25 = blockSales(dates, 0, Math.min(rules.pctBlock, dates.length), salesByMonth).sales;
  } else if (started && r.blockSalesManual?.[0] != null) first25 = r.blockSalesManual[0];
  const n25 = done == null ? 0 : Math.min(rules.pctBlock, done);
  const perShift = first25 != null && n25 >= MIN_SHIFTS_RATE ? round2(first25 / n25) : null;
  const reached25 = done != null && done >= rules.pctBlock;
  return { started, shiftsDone: done, salesTotal, first25, perShift, reached25, decided: reached25 || (started && Boolean(r.exitedAt)) || (!started && (Boolean(stopReason(r)) || Boolean(r.exitedAt))) };
}

const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/**
 * recruits: [{ ...recruit, metrics, milestones }], stories: [{ ...story, milestone }],
 * referrers: [{ id, name }], fx: { mese: cambio }.
 */
export function buildDashboard({ referrers = [], recruits = [], stories = [], fx = {}, today, rules = REFERRAL_RULES } = {}) {
  const N = recruits.length;
  const count = (f) => recruits.filter(f).length;
  const funnel = [
    { key: "referred", label: "Segnalate", n: N },
    { key: "interview", label: "Colloquio passato", n: count((r) => r.interviewPassed === true || r.trainingPassed === true || (r.interviewAt && r.interviewPassed == null)) },
    { key: "training", label: "Formazione superata", n: count((r) => r.trainingPassed === true) },
    { key: "first_shift", label: "Primo turno", n: count((r) => r.metrics.started) },
    { key: "s25", label: "25 turni", n: count((r) => (r.metrics.shiftsDone ?? 0) >= 25) },
    { key: "s50", label: "50 turni", n: count((r) => (r.metrics.shiftsDone ?? 0) >= 50) },
    { key: "s75", label: "75 turni", n: count((r) => (r.metrics.shiftsDone ?? 0) >= 75) },
  ].map((f) => ({ ...f, pct: pctOf(f.n, N) }));

  // storie
  const storyOk = stories.filter((s) => s.milestone.status === "maturato" || s.milestone.status === "pagato");
  const fromStory = recruits.filter((r) => r.storyId);
  const agreedList = stories.filter((s) => s.agreedAt);
  const withViews = storyOk.filter((s) => s.views != null);
  const storyStats = {
    proposed: stories.length,
    pending: stories.length - agreedList.length, // proposte inviate, ok non ancora dato
    agreed: agreedList.length,
    published: storyOk.length,
    expired: agreedList.filter((s) => s.milestone.status === "perso").length,
    open: agreedList.filter((s) => s.milestone.status === "in_attesa").length,
    views: withViews.length ? withViews.reduce((a, s) => a + s.views, 0) : null,
    viewsReported: withViews.length,
    publishers: new Set(storyOk.map((s) => s.referrerId)).size,
    recruitsFromStories: fromStory.length,
    recruitsPerStory: storyOk.length ? Math.round((fromStory.length / storyOk.length) * 100) / 100 : null,
    // chi ha pubblicato: storie complete e persone arrivate dalle sue storie
    byReferrer: [...new Set(stories.map((s) => s.referrerId))].map((id) => ({
      referrerId: id,
      name: referrers.find((x) => x.id === id)?.name || "—",
      agreed: agreedList.filter((s) => s.referrerId === id).length,
      published: storyOk.filter((s) => s.referrerId === id).length,
      recruits: fromStory.filter((r) => r.referrerId === id).length,
    })).filter((x) => x.agreed > 0).sort((a, b) => b.published - a.published || b.recruits - a.recruits),
  };
  // con storia vs senza: arrivano a 25 turni?
  const tenure = (list) => {
    const dec = list.filter((r) => r.metrics.decided);
    return { n: list.length, decided: dec.length, reached: dec.filter((r) => r.metrics.reached25).length, pct: dec.length >= MIN_DECIDED ? pctOf(dec.filter((r) => r.metrics.reached25).length, dec.length) : null };
  };
  const channel = { withStory: tenure(fromStory), withoutStory: tenure(recruits.filter((r) => !r.storyId)) };

  // reference di qualità: per referente
  const rates = recruits.map((r) => r.metrics.perShift).filter((x) => x != null);
  const avgRate = rates.length ? round2(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
  const quality = referrers.map((ref) => {
    const mine = recruits.filter((r) => r.referrerId === ref.id);
    const t = tenure(mine);
    const myRates = mine.map((r) => r.metrics.perShift).filter((x) => x != null);
    const rate = myRates.length ? round2(myRates.reduce((a, b) => a + b, 0) / myRates.length) : null;
    return {
      referrerId: ref.id, name: ref.name,
      referred: mine.length, started: mine.filter((r) => r.metrics.started).length,
      reached25: mine.filter((r) => r.metrics.reached25).length,
      decided: t.decided, tenurePct: t.pct, fewData: t.decided < MIN_DECIDED,
      perShift: rate, vsAvg: rate != null && avgRate ? Math.round((rate / avgRate) * 100) / 100 : null,
      salesTotal: round2(mine.reduce((a, r) => a + (r.metrics.salesTotal || 0), 0)),
    };
  }).filter((q) => q.referred > 0).sort((a, b) => b.reached25 - a.reached25 || (b.perShift ?? -1) - (a.perShift ?? -1) || b.referred - a.referred);

  // costo e ritorno
  const allMs = [...recruits.flatMap((r) => r.milestones), ...stories.map((s) => s.milestone)];
  const sum = (st) => round2(allMs.filter((m) => m.status === st && m.amountEur != null).reduce((a, m) => a + m.amountEur, 0));
  const costEur = round2(sum("pagato") + sum("maturato"));
  const salesUsd = round2(recruits.reduce((a, r) => a + (r.metrics.salesTotal || 0), 0));
  const fxVals = Object.values(fx).filter((x) => x != null);
  const fxAvg = fxVals.length ? fxVals.reduce((a, b) => a + b, 0) / fxVals.length : null;
  const marginEur = fxAvg != null ? round2(salesUsd * fxAvg * NET_MARGIN_ON_SALES) : null;
  const reached = funnel.find((f) => f.key === "s25").n;
  const economics = {
    costEur, paidEur: sum("pagato"), dueEur: sum("maturato"), runningEur: sum("in_corso"),
    salesUsd, marginEur, fxAvg: fxAvg != null ? Math.round(fxAvg * 10000) / 10000 : null,
    costPer25: reached ? round2(costEur / reached) : null,
    costOnMarginPct: marginEur ? pctOf(costEur, marginEur) : null,
  };

  // andamento per mese: segnalate e primi turni
  const months = {};
  const bump = (m, k) => { if (!m) return; (months[m] ||= { month: m, referred: 0, started: 0 })[k]++; };
  for (const r of recruits) {
    bump(r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 7) : null, "referred");
    if (r.metrics.started) bump(r.firstShiftAt.slice(0, 7), "started");
  }
  // mesi vuoti in mezzo compresi (un mese senza segnalazioni è un dato, non un buco)
  const keys = Object.keys(months).sort();
  const trend = [];
  if (keys.length) for (let m = keys[0]; m <= keys[keys.length - 1]; m = addMonths(m, 1)) trend.push(months[m] || { month: m, referred: 0, started: 0 });
  trend.splice(0, Math.max(0, trend.length - 12));

  return { today, funnel, storyStats, channel, quality, avgRate, economics, trend, minDecided: MIN_DECIDED, minShiftsRate: MIN_SHIFTS_RATE };
}

// ── Missioni e buste (27/10/2026) ───────────────────────────────────────────
//
// Idea di Nicholas: ogni premio è una MISSIONE che si sblocca; quando si
// sblocca l'HR lo vede e il premio finisce nella BUSTA del mese del referente.
// Nessun numero nuovo: missioni e buste leggono le stesse voci di
// recruitMilestones/storyMilestone (una sola fonte, niente drift).

/**
 * Avanzamento di una missione: { done, target, unit } o null se non misurabile.
 * first_shift: tappe fatte su 3 (colloquio, formazione superata, primo turno).
 */
export function missionProgress(m, recruit = {}) {
  if (m.kind === "shifts") return m.shiftsDone == null ? null : { done: Math.min(m.shiftsDone, m.shifts), target: m.shifts, unit: "turni" };
  if (m.kind === "commission") return m.shiftsDone == null ? null : { done: Math.min(m.shiftsDone, m.shiftsTo), target: m.shiftsTo, unit: "turni" };
  // storie non ancora concordate: niente barra, si legge il passaggio (why)
  if (m.kind === "story") return m.dueBy == null ? null : { done: Math.min(m.published || 0, REFERRAL_RULES.storiesRequired), target: REFERRAL_RULES.storiesRequired, unit: "storie" };
  if (m.kind === "first_shift") {
    const d = [recruit.interviewPassed === true || (recruit.interviewAt && recruit.interviewPassed !== false), recruit.trainingPassed === true, recruit.firstShiftAt && recruit.trainingPassed === true].filter(Boolean).length;
    return { done: d, target: 3, unit: "tappe" };
  }
  return null;
}

/** Mese della busta di una voce: mese in cui si è sbloccata (o, se non si sa, in cui è stata pagata; altrimenti oggi). */
export function payslipMonth(m, today) {
  return (m.unlockedAt || m.paidAt || today).slice(0, 7);
}

/**
 * Buste: per referente e per mese, le voci sbloccate (da pagare) o pagate.
 * recruits: [{ id, name, referrerId, milestones }], stories: [{ referrerId, milestone }].
 * → [{ referrerId, name, month, lines:[…], totalEur, paidEur, dueEur, waitingFxUsd }], ordinate per mese desc, poi nome.
 */
export function buildPayslips({ referrers = [], recruits = [], stories = [], today }) {
  const byKey = new Map();
  const add = (referrerId, m, recruitName) => {
    if (m.status !== "maturato" && m.status !== "pagato") return;
    const month = payslipMonth(m, today);
    const k = `${referrerId}|${month}`;
    if (!byKey.has(k)) byKey.set(k, { referrerId, name: referrers.find((r) => r.id === referrerId)?.name || "—", month, lines: [] });
    byKey.get(k).lines.push({ key: m.key, label: m.label, recruitName: recruitName || null, status: m.status, amountEur: m.amountEur, amountUsd: m.amountUsd ?? null, unlockedAt: m.unlockedAt || null, paidAt: m.paidAt || null, fxMissing: m.amountEur == null });
  };
  for (const r of recruits) for (const m of r.milestones || []) add(r.referrerId, m, r.name);
  for (const s of stories) add(s.referrerId, s.milestone, null);
  const out = [...byKey.values()].map((b) => {
    const eur = (st) => round2(b.lines.filter((l) => l.status === st && l.amountEur != null).reduce((a, l) => a + l.amountEur, 0));
    const lines = b.lines.sort((x, y) => String(x.unlockedAt || "").localeCompare(String(y.unlockedAt || "")));
    return { ...b, lines, paidEur: eur("pagato"), dueEur: eur("maturato"), totalEur: round2(eur("pagato") + eur("maturato")), waitingFxUsd: round2(lines.filter((l) => l.fxMissing && l.amountUsd != null).reduce((a, l) => a + l.amountUsd, 0)) };
  });
  return out.sort((a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name, "it"));
}

/** CSV di una o più buste (separatore «;» e virgola decimale, come lo apre Excel in italiano). */
export function payslipsCsv(slips = []) {
  const n = (v) => (v == null ? "" : String(v).replace(".", ","));
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Mese", "Referente", "Premio", "Persona portata", "Sbloccato", "Importo €", "Importo $", "Stato", "Pagato il"].map(q).join(";")];
  for (const b of slips) for (const l of b.lines) {
    rows.push([b.month, b.name, l.label, l.recruitName || "", l.unlockedAt || "", n(l.amountEur), n(l.amountUsd), l.status === "pagato" ? "pagato" : l.fxMissing ? "manca il cambio" : "da pagare", l.paidAt || ""].map((v, i) => (i === 5 || i === 6 ? v : q(v))).join(";"));
  }
  return rows.join("\n");
}

/** Cose che l'HR deve fare adesso: premi sbloccati da pagare + mesi senza cambio. */
export function hrInbox({ toPay = [], fxMonths = [], fx = {} } = {}) {
  const fxMissing = fxMonths.filter((m) => fx[m] == null).length;
  return { toPay: toPay.length, fxMissing, count: toPay.length + fxMissing };
}
