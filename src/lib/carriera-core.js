/**
 * Carriera — logica pura (23/11/2026). Niente I/O: lo usano l'API /api/carriera e i test.
 *
 * Il sistema di performance management della chat (mappa completa sulla lavagna Miro
 * «Sistema di performance management Chat Sales», regolamento in lib/carriera-regole):
 *   - FASCIA A/B/C = quanto vendi rispetto ai colleghi sulla stessa modella e fascia oraria.
 *     L'indice viene dal calcolo notturno della Squadra (lib/squadra, `idx` sui 3 mesi,
 *     `m2`/`m1` sui due mesi chiusi presi uno per uno). Limite dichiarato in v0.1: conta
 *     tutto il venduto Infloww dell'operatore, non solo i suoi PPV.
 *   - REVISIONE dovuta = fascia C in ENTRAMBI i due mesi chiusi. Nessuno la decide a mano.
 *   - ECCEZIONE del sales coach = tiene qualcuno sotto soglia sul profilo, ma scrive il
 *     motivo e scade (al massimo un mese).
 *   - ROUNDTABLE = tre righe a settimana per profilo: chi c'era, cosa si è visto, la prova.
 *   - FERMI (nessun turno da 21 giorni) restano fuori: senza turni non c'è niente da rivedere.
 *
 * Le soglie sono la REGOLA: cambiarle = nuova CARRIERA_VERSION (le persone vedono lo storico).
 * v0.1: soglie 0,85 / 1,2 dallo studio di ottobre (seniority-data-evidence): su questo indice
 *       tenevano in C un terzo degli attivi (45 su 134, 20 revisioni dovute).
 * v0.2 (23/11/2026, decisione di Nicholas sui dati veri): C sotto 0,70 = il quarto più basso
 *       (33 su 134 in C, 7 revisioni dovute). A resta 1,2.
 */
import { nameKey } from "./squadra-core.js";

export const CARRIERA_VERSION = "carriera-0.2";
export const SOGLIE = { A: 1.2, C: 0.7 };
export const ECCEZIONE_MAX_GIORNI = 31;
export const PIANO_SETTIMANE = 6;
/** Nessun turno da 3 settimane = fermo (stessa regola della Squadra in Coaching vendite): fuori da fasce e revisioni. */
export const FERMO_GIORNI = 21;

export const FASCE = {
  A: { label: "Fascia A", desc: "Vende almeno il 20% in più dei colleghi" },
  B: { label: "Fascia B", desc: "In linea con i colleghi" },
  C: { label: "Fascia C", desc: "Più del 30% sotto i colleghi" },
};

export const STATI = {
  in_revisione: { label: "In revisione", order: 0 },
  revisione_dovuta: { label: "Revisione dovuta", order: 1 },
  eccezione: { label: "Eccezione del sales coach", order: 2 },
  attenzione: { label: "Ultimo mese in C", order: 3 },
  ok: { label: "Regolare", order: 4 },
  non_valutabile: { label: "Non valutabile", order: 5 },
};

export const FASI_REVISIONE = [
  ["colloquio", "Colloquio"],
  ["piano", "Piano di 6 settimane"],
  ["verifica", "Verifiche"],
  ["chiusa", "Esito"],
];

export const ESITI = {
  rientra: "Rientra",
  altro_profilo: "Prova su un altro profilo",
  lascia_profilo: "Lascia il profilo",
};

const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const txt = (v, max = 600) => String(v ?? "").trim().slice(0, max);
const iso = (ms) => new Date(ms).toISOString();

/** Fascia di un indice resa-vs-colleghi. null = non valutabile (pochi dati o nessun confronto). */
export function fasciaOf(idx) {
  const v = num(idx);
  if (v == null) return null;
  if (v >= SOGLIE.A) return "A";
  if (v < SOGLIE.C) return "C";
  return "B";
}

/** Profilo principale = la pagina dove ha fatto più ore. crs = {cid: quota ore}. */
export function primaryProfile(crs, names = {}) {
  const top = Object.entries(crs || {}).filter(([, q]) => num(q) != null).sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const [cid, share] = top;
  return { cid: String(cid), name: names[cid] || String(cid), share: Math.round(Number(share) * 100) / 100 };
}

/** La regola di revisione: C in entrambi i mesi chiusi. «Attenzione» = solo l'ultimo in C. */
export function triggerOf({ m2, m1 }) {
  const f2 = fasciaOf(m2);
  const f1 = fasciaOf(m1);
  if (f2 === "C" && f1 === "C") return "dovuta";
  if (f1 === "C") return "attenzione";
  return null;
}

export function statoOperatore(row, { reviewOpen = false, exceptionActive = false } = {}) {
  if (reviewOpen) return "in_revisione";
  const trig = triggerOf(row || {});
  if (trig === "dovuta") return exceptionActive ? "eccezione" : "revisione_dovuta";
  if (trig === "attenzione") return "attenzione";
  if (fasciaOf(row?.idx) == null && fasciaOf(row?.m1) == null) return "non_valutabile";
  return "ok";
}

// ── id e settimane ──────────────────────────────────────────────────────────

export function newId(now = Date.now(), rnd = Math.random) {
  return `${now.toString(36)}${Math.floor(rnd() * 1e8).toString(36)}`;
}

/** Settimana ISO in ora di Roma ("2026-W48"): la roundtable è una per profilo per settimana. */
export function isoWeek(ms = Date.now()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  const d = new Date(`${p}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // lun = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // giovedì della settimana
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ── revisioni ───────────────────────────────────────────────────────────────

export function newReview({ operator, profile, trigger, by, now = Date.now(), id }) {
  const op = txt(operator, 120);
  if (!op) return { ok: false, error: "Manca l'operatore." };
  return {
    ok: true,
    review: {
      id: id || newId(now),
      version: CARRIERA_VERSION,
      operator: op,
      key: nameKey(op),
      profile: txt(profile, 120) || null,
      trigger: trigger ? { idx: num(trigger.idx), m2: num(trigger.m2), m1: num(trigger.m1), months: trigger.months || null } : null,
      fase: "colloquio",
      opened_at: iso(now),
      opened_by: txt(by, 120),
      colloquio: null,
      piano: null,
      verifiche: [],
      esito: null,
      log: [{ at: iso(now), by: txt(by, 120), what: "aperta" }],
    },
  };
}

/** Un passo della revisione. Ritorna { ok, review } oppure { ok:false, error }. Non muta l'input. */
export function applyReviewStep(review, step, payload = {}, { by, now = Date.now() } = {}) {
  if (!review) return { ok: false, error: "Revisione non trovata." };
  if (review.fase === "chiusa") return { ok: false, error: "La revisione è già chiusa." };
  const r = { ...review, verifiche: [...(review.verifiche || [])], log: [...(review.log || [])] };
  const who = txt(by, 120);
  if (step === "colloquio") {
    const note = txt(payload.note, 2000);
    if (note.length < 10) return { ok: false, error: "Scrivi due righe sul colloquio." };
    r.colloquio = { at: iso(now), by: who, note };
    if (r.fase === "colloquio") r.fase = "piano";
  } else if (step === "piano") {
    if (!r.colloquio) return { ok: false, error: "Prima il colloquio." };
    const obiettivi = (Array.isArray(payload.obiettivi) ? payload.obiettivi : [payload.obiettivi]).map((o) => txt(o, 300)).filter(Boolean).slice(0, 2);
    if (!obiettivi.length) return { ok: false, error: "Serve almeno un obiettivo in numeri." };
    const fine = iso(now + PIANO_SETTIMANE * 7 * 86400000);
    r.piano = { at: iso(now), by: who, obiettivi, allenamento: txt(payload.allenamento, 600) || null, fine };
    if (r.fase === "piano") r.fase = "verifica";
  } else if (step === "verifica") {
    if (!r.piano) return { ok: false, error: "Prima il piano." };
    const note = txt(payload.note, 2000);
    if (note.length < 10) return { ok: false, error: "Scrivi com'è andata la verifica." };
    r.verifiche.push({ at: iso(now), by: who, note });
  } else if (step === "esito") {
    if (!r.piano) return { ok: false, error: "Prima il piano." };
    if (!ESITI[payload.tipo]) return { ok: false, error: "Scegli l'esito." };
    const revisore = txt(payload.firma_revisore, 120);
    const coach = txt(payload.firma_coach, 120);
    if (!revisore || !coach) return { ok: false, error: "Servono le due firme: revisore e sales coach di un altro profilo." };
    if (nameKey(revisore) === nameKey(coach)) return { ok: false, error: "Le due firme devono essere di due persone diverse." };
    r.esito = { at: iso(now), by: who, tipo: payload.tipo, note: txt(payload.note, 2000) || null, firma_revisore: revisore, firma_coach: coach };
    r.fase = "chiusa";
    r.closed_at = iso(now);
  } else {
    return { ok: false, error: "Passo non previsto." };
  }
  r.log.push({ at: iso(now), by: who, what: step });
  return { ok: true, review: r };
}

// ── eccezioni del sales coach ───────────────────────────────────────────────

export function newException({ operator, profile, motivo, giorni, by, now = Date.now(), id }) {
  const op = txt(operator, 120);
  const why = txt(motivo, 1000);
  const days = Math.round(num(giorni) ?? ECCEZIONE_MAX_GIORNI);
  if (!op) return { ok: false, error: "Manca l'operatore." };
  if (why.length < 15) return { ok: false, error: "Scrivi il motivo: è la parte che conta." };
  if (days < 1 || days > ECCEZIONE_MAX_GIORNI) return { ok: false, error: `L'eccezione dura al massimo ${ECCEZIONE_MAX_GIORNI} giorni.` };
  return {
    ok: true,
    exception: { id: id || newId(now), operator: op, key: nameKey(op), profile: txt(profile, 120) || null, motivo: why, from: iso(now), until: iso(now + days * 86400000), by: txt(by, 120), ended_at: null },
  };
}

export const isExceptionActive = (e, now = Date.now()) => Boolean(e) && !e.ended_at && Date.parse(e.until) > now;

// ── roundtable ──────────────────────────────────────────────────────────────

export function newRoundtable({ profile, presenti, visto, prova, by, now = Date.now(), id }) {
  const prof = txt(profile, 120);
  const seen = txt(visto, 1000);
  const test = txt(prova, 600);
  if (!prof) return { ok: false, error: "Manca il profilo." };
  if (seen.length < 10) return { ok: false, error: "Scrivi cosa si è visto." };
  if (test.length < 5) return { ok: false, error: "Scrivi la prova scelta per la settimana." };
  const n = num(presenti);
  return {
    ok: true,
    roundtable: { id: id || newId(now), profile: prof, week: isoWeek(now), at: iso(now), presenti: n == null ? null : Math.max(0, Math.round(n)), visto: seen, prova: test, by: txt(by, 120) },
  };
}

// ── quadro ──────────────────────────────────────────────────────────────────

/**
 * Righe della Squadra → righe della Carriera, filtrate da `allow(nomeProfilo)`.
 * reviews/exceptions/roundtables: liste complete; qui si agganciano per operatore/profilo.
 */
export function buildQuadro({ rows = [], names = {}, reviews = [], exceptions = [], roundtables = [], allow = () => true, now = Date.now() }) {
  const openByKey = new Map(reviews.filter((r) => r.fase !== "chiusa").map((r) => [r.key, r]));
  const excByKey = new Map();
  for (const e of exceptions) if (isExceptionActive(e, now)) excByKey.set(e.key, e);
  const week = isoWeek(now);
  const rtThisWeek = new Set(roundtables.filter((r) => r.week === week).map((r) => r.profile));

  const operators = [];
  let fermi = 0;
  for (const row of rows) {
    const prof = primaryProfile(row.crs, names);
    if (!allow(prof?.name || null)) continue;
    const last = row.last_shift ? Date.parse(row.last_shift) : NaN;
    if (!Number.isFinite(last) || now - last > FERMO_GIORNI * 86400000) { fermi++; continue; }
    const key = nameKey(row.name);
    const review = openByKey.get(key) || null;
    const exc = excByKey.get(key) || null;
    const stato = statoOperatore(row, { reviewOpen: Boolean(review), exceptionActive: Boolean(exc) });
    operators.push({
      name: row.name,
      key,
      profile: prof,
      idx: num(row.idx),
      fascia: fasciaOf(row.idx),
      m2: num(row.m2),
      m1: num(row.m1),
      fascia_m2: fasciaOf(row.m2),
      fascia_m1: fasciaOf(row.m1),
      hours: num(row.h),
      few_peers: Boolean(row.few_peers),
      last_shift: row.last_shift || null,
      stato,
      review_id: review?.id || null,
      exception: exc ? { id: exc.id, until: exc.until, motivo: exc.motivo, by: exc.by } : null,
    });
  }
  operators.sort((a, b) => STATI[a.stato].order - STATI[b.stato].order || (a.idx ?? 9) - (b.idx ?? 9));

  const counts = { A: 0, B: 0, C: 0, nv: 0, dovute: 0, attenzione: 0, in_revisione: 0, eccezioni: 0, fermi };
  const byProfile = new Map();
  for (const o of operators) {
    counts[o.fascia || "nv"]++;
    if (o.stato === "revisione_dovuta") counts.dovute++;
    if (o.stato === "attenzione") counts.attenzione++;
    if (o.stato === "in_revisione") counts.in_revisione++;
    if (o.stato === "eccezione") counts.eccezioni++;
    const pn = o.profile?.name || "Senza profilo";
    const p = byProfile.get(pn) || { profile: pn, n: 0, A: 0, B: 0, C: 0, nv: 0, dovute: 0, roundtable: rtThisWeek.has(pn) };
    p.n++;
    p[o.fascia || "nv"]++;
    if (o.stato === "revisione_dovuta") p.dovute++;
    byProfile.set(pn, p);
  }
  return { week, operators, counts, profiles: [...byProfile.values()].sort((a, b) => b.dovute - a.dovute || b.n - a.n) };
}
