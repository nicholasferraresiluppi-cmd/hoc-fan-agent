/**
 * HOC Pro — Schema dell'event-store persona ("CRM persone" · Livello 1).
 *
 * Questo modulo è lo SCHEMA STABILE del ciclo di vita di un operatore, derivato
 * dal career ladder (`docs/CAREER_LADDER.md`). È l'implementazione software
 * della timeline che manca oggi: assunzione → onboarding → certificazioni →
 * promozioni → QA → coaching → uscita.
 *
 * ⚠️ STATO: SOLO SCHEMA. Qui ci sono definizioni PURE (enum livelli, tassonomia
 * eventi, key builder, validazione, proiezione dello stato). NON c'è il percorso
 * di SCRITTURA (API/cron che appende eventi in KV): quello è una modifica al
 * modello dati KV (one-way semi) e parte solo dopo che l'ADR è accettato —
 * vedi `docs/PERSON_EVENT_STORE.md`. Finché nessuno importa e scrive, questo
 * file non tocca alcun dato.
 *
 * Principio: l'event-store è APPEND-ONLY (come la policy dispute del ladder §8.2:
 * "nessun cambiamento silenzioso"). Lo stato corrente (livello, step, status) è
 * una PROIEZIONE derivata dagli eventi, non una verità scritta a mano.
 */

// ── Livelli (enum stabile dal ladder §3) ────────────────────────────────────
// `order` serve solo per confrontare avanzamenti sul binario operatore; i due
// track a L4 (a=gestione, b=esperto) condividono l'ordine 4 — la divergenza è
// nel `track`, non nel livello (principio 4 del ladder: doppio binario).
export const LEVELS = [
  { id: "L0",  order: 0, title: "Trainee",                     track: "onboarding" },
  { id: "L1",  order: 1, title: "Sales Operator I",            track: "operator" },
  { id: "L2",  order: 2, title: "Sales Operator II",           track: "operator" },
  { id: "L3",  order: 3, title: "Sales Operator III (Senior)", track: "operator" },
  { id: "L4a", order: 4, title: "Team Lead",                   track: "management" },
  { id: "L4b", order: 4, title: "Senior Sales Specialist",     track: "expert" },
  { id: "L5",  order: 5, title: "Sales Manager",               track: "management" },
  { id: "L6",  order: 6, title: "Head of Sales / Performance", track: "management" },
];
export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
export const LEVEL_IDS = LEVELS.map((l) => l.id);
// Livelli con Steps interni (L1-L3 hanno 3 step, ladder §5).
export const STEP_LEVELS = new Set(["L1", "L2", "L3"]);
export const STEPS_PER_LEVEL = 3;

// ── Tassonomia eventi (stabile) ─────────────────────────────────────────────
// Ogni evento appartiene a una categoria (per raggruppare la timeline) e
// dichiara i campi attesi del `payload` (contratto, usato da validateEvent e
// come documentazione). `source` traccia la provenienza: da dove nasce il dato
// oggi in HOC Pro (per il backfill) — vedi docs/PERSON_EVENT_STORE.md §mapping.
export const EVENT_CATEGORIES = ["lifecycle", "development", "performance", "quality", "hr"];

export const EVENT_TYPES = {
  hire:             { category: "lifecycle",   label: "Assunzione",                payload: ["role"],                    source: "employee_profile.start_date" },
  onboarding_phase: { category: "lifecycle",   label: "Fase onboarding",           payload: ["phase", "status"],          source: "manuale (fase 2)" },
  graduation:       { category: "lifecycle",   label: "Graduazione → L1",          payload: [],                           source: "onboarding (fase 2)" },
  level_change:     { category: "development", label: "Cambio livello",            payload: ["from", "to", "direction"], source: "progression engine (fase 3)" },
  step_change:      { category: "development", label: "Cambio step",               payload: ["level", "from", "to"],      source: "progression engine (fase 3)" },
  certification:    { category: "development", label: "Certificazione",            payload: ["creator", "tier"],          source: "certifications.js (esistente)" },
  mentoring:        { category: "development", label: "Mentoring nuovo ingresso",  payload: ["mentee", "outcome"],        source: "manuale (fase 2)" },
  qa_review:        { category: "quality",     label: "Review QA",                 payload: ["period", "avg", "pass"],    source: "qa-reviews (esistente)" },
  coaching_session: { category: "quality",     label: "Sessione coaching",         payload: ["by"],                       source: "cm:sup:* / coaching-sessions (esistente)" },
  dispute_opened:   { category: "quality",     label: "Contestazione aperta",      payload: ["period", "metric"],         source: "disputes (esistente)" },
  dispute_resolved: { category: "quality",     label: "Contestazione risolta",     payload: ["period", "outcome"],        source: "disputes (esistente)" },
  checkin:          { category: "lifecycle",   label: "Check-in post-promozione",  payload: ["milestone", "done"],        source: "progression engine (fase 3)" },
  band_assignment:  { category: "development", label: "Priorità banda assegnata",  payload: ["band"],                     source: "manuale (fase 3)" },
  hr_action:        { category: "hr",          label: "Azione HR",                 payload: ["kind", "status"],           source: "action_center:* (esistente)" },
  note:             { category: "hr",          label: "Nota",                      payload: ["text"],                     source: "employee_profile.note (esistente)" },
  offboarding:      { category: "lifecycle",   label: "Uscita",                    payload: [],                           source: "manuale (fase 2)" },
};
export const EVENT_TYPE_IDS = Object.keys(EVENT_TYPES);

// Valori chiusi per alcuni campi payload (validazione + UI).
export const ONBOARDING_PHASES = ["A", "B", "C", "D"];       // Setup / Shadowing / Trial / Graduazione (ladder §9)
export const CERT_TIERS = ["base", "expert", "master"];       // certifications.js
export const LEVEL_DIRECTIONS = ["promotion", "correction", "demotion"];
export const CHECKIN_MILESTONES = ["2w", "30d", "60d", "90d"]; // ladder §7

// ── Key builder KV (namespace `person:`) ────────────────────────────────────
// personId: identità stabile dell'operatore. DECISIONE APERTA (vedi ADR §identità):
// proposta = employeeId Infloww (id macchina stabile), con fallback al nome
// canonico normalizzato per il join con `employee_profile:{name}` finché la
// consolidazione identità non è fatta. Questo modulo non impone la scelta:
// prende un `personId` già risolto dal chiamante.
export const PERSON_INDEX_KEY = "person:index";                 // set di personId
export const personEventsKey = (personId) => `person:events:${personId}`;  // lista append-only di eventi
export const personStateKey = (personId) => `person:state:${personId}`;    // proiezione stato corrente (cache)

// ── Validazione / normalizzazione ───────────────────────────────────────────
export function isValidEventType(type) {
  return Object.prototype.hasOwnProperty.call(EVENT_TYPES, type);
}

/**
 * Normalizza un evento in ingresso nella forma canonica dell'event-store.
 * `at`/`id` NON vengono generati qui (Date.now()/uuid = effetto collaterale):
 * li fornisce il percorso di scrittura, così questo modulo resta puro.
 */
export function normalizeEvent({ id, type, at, by = null, source = null, payload = {} }) {
  return { id: id || null, type, at: at || null, by, source, payload: payload || {} };
}

/** @returns {{ ok: boolean, errors: string[] }} */
export function validateEvent(ev) {
  const errors = [];
  if (!ev || typeof ev !== "object") return { ok: false, errors: ["evento assente"] };
  if (!isValidEventType(ev.type)) errors.push(`tipo sconosciuto: ${ev.type}`);
  if (ev.at == null || !Number.isFinite(Number(ev.at))) errors.push("`at` (timestamp ms) mancante o non numerico");
  const spec = EVENT_TYPES[ev.type];
  if (spec) {
    const p = ev.payload || {};
    for (const key of spec.payload) {
      if (p[key] == null || p[key] === "") errors.push(`payload.${key} richiesto per ${ev.type}`);
    }
    if (ev.type === "onboarding_phase" && p.phase && !ONBOARDING_PHASES.includes(p.phase)) errors.push(`phase non valida: ${p.phase}`);
    if (ev.type === "certification" && p.tier && !CERT_TIERS.includes(p.tier)) errors.push(`tier non valido: ${p.tier}`);
    if (ev.type === "level_change") {
      if (p.to && !LEVEL_BY_ID[p.to]) errors.push(`livello 'to' sconosciuto: ${p.to}`);
      if (p.from && !LEVEL_BY_ID[p.from]) errors.push(`livello 'from' sconosciuto: ${p.from}`);
      if (p.direction && !LEVEL_DIRECTIONS.includes(p.direction)) errors.push(`direction non valida: ${p.direction}`);
    }
    if (ev.type === "checkin" && p.milestone && !CHECKIN_MILESTONES.includes(p.milestone)) errors.push(`milestone non valida: ${p.milestone}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Proiezione: dallo storico append-only ricava lo STATO CORRENTE della persona.
 * Pura e deterministica. Ordina per `at` e applica gli eventi rilevanti.
 * Lo stato è cache (`person:state`), mai la fonte di verità — la fonte sono gli
 * eventi (invariante ladder §8.2: nessuno stato scritto a mano che gli eventi
 * non spieghino).
 */
export function deriveState(events) {
  const evs = [...(events || [])].filter((e) => e && e.at != null).sort((a, b) => Number(a.at) - Number(b.at));
  const state = {
    status: "unknown",           // trainee | active | left
    level: null,                 // "L0".."L6"
    step: null,                  // 1..3 dentro il livello (solo L1-L3)
    hired_at: null,
    left_at: null,
    last_level_change_at: null,
    certifications: 0,
    last_qa: null,               // {period, avg, pass}
    open_disputes: 0,
    event_count: evs.length,
    last_event_at: evs.length ? Number(evs[evs.length - 1].at) : null,
  };
  for (const e of evs) {
    const p = e.payload || {};
    switch (e.type) {
      case "hire":            state.status = "trainee"; state.level = "L0"; state.hired_at = Number(e.at); break;
      case "graduation":      state.status = "active"; state.level = "L1"; state.step = STEP_LEVELS.has("L1") ? 1 : null; break;
      case "level_change":    if (p.to) { state.level = p.to; state.step = STEP_LEVELS.has(p.to) ? 1 : null; state.last_level_change_at = Number(e.at); if (state.status === "unknown") state.status = "active"; } break;
      case "step_change":     if (p.to != null) state.step = Number(p.to); break;
      case "certification":   state.certifications += 1; break;
      case "qa_review":       state.last_qa = { period: p.period ?? null, avg: p.avg ?? null, pass: p.pass ?? null }; break;
      case "dispute_opened":  state.open_disputes += 1; break;
      case "dispute_resolved": state.open_disputes = Math.max(0, state.open_disputes - 1); break;
      case "offboarding":     state.status = "left"; state.left_at = Number(e.at); break;
      default: break;
    }
  }
  return state;
}
