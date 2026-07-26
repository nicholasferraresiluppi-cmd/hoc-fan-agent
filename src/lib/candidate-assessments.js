/**
 * Candidate assessments — data model per l'assessment pre-assunzione (V1).
 *
 * Il simulatore Academy, puntato verso l'ESTERNO: un candidato (non ancora
 * dipendente, nessun account Clerk) fa una suite di scenari via link monouso,
 * e HR riceve un report (score + compliance + signals) come SEGNALE nella
 * scorecard. Human-in-the-loop: NON è un gate automatico (GDPR art.22 / AI Act
 * Annex III — cfr docs/ADR-candidate-assessment.md).
 *
 * Isolamento (regola di disciplina): namespace KV `candidate:*` COMPLETAMENTE
 * separato da `session:*`, `score_hist:*`, `profile:*` e dalle leghe/leaderboard
 * degli operatori. Un candidato non è un operatore e non deve mai entrare nelle
 * classifiche né nei dati denaro.
 *
 * Auth: il TOKEN è l'auth. Nessun segreto condiviso; le route pubbliche caricano
 * l'assessment dal token e si difendono da sole (validità/scadenza/stato).
 *
 * Bridge V2: ogni assessment porta un campo `outcome` (decisione di hiring +
 * employeeId) che un domani permette di correlare lo score del candidato con la
 * resa reale sul vivo — è ciò che valida (o smentisce) la predittività prima di
 * considerare qualunque uso più forte del punteggio.
 */

import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";
import { TRAINING_SCENARIOS } from "@/lib/training-scenarios";

const NS = "candidate";
const INDEX_KEY = "candidate:index"; // ZSET createdAt → token
const DEFAULT_TTL_DAYS = 14;
const TTL_SECONDS_EXTRA = 60 * 60 * 24 * 30; // il record KV sopravvive 30gg oltre la scadenza logica (per il report HR)

export const ASSESSMENT_STATUS = {
  INVITED: "invited",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  EXPIRED: "expired",
};

/**
 * Suite di assessment. Scenari REALI del catalogo Academy (nessuna modifica).
 * Deliberatamente creator-agnostiche e senza archetipo fisso in V1: stesso set
 * per tutti i candidati = confronto equo (fairness). La calibrazione per-creator
 * / difficoltà dedicata è un passo successivo.
 */
export const ASSESSMENT_SUITES = [
  {
    id: "chatter-core",
    name: "Chatter — core",
    description:
      "Quattro situazioni reali: apertura, conversione di un segnale debole, gestione di una resistenza, e una riga rossa di compliance.",
    scenarioIds: [
      "basics-001-new-subscriber",
      "mass-001-eyes-emoji",
      "custom-003-maybe-later",
      "compliance-003-pagamento-fuori",
    ],
    estMinutes: 20,
  },
];

export function listSuites() {
  return ASSESSMENT_SUITES.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    scenarioCount: s.scenarioIds.length,
    estMinutes: s.estMinutes,
  }));
}

export function getSuite(suiteId) {
  return ASSESSMENT_SUITES.find((s) => s.id === suiteId) || null;
}

function resolveScenario(scenarioId) {
  for (const cat of TRAINING_SCENARIOS) {
    const found = cat.scenarios?.find((s) => s.id === scenarioId);
    if (found) return found;
  }
  return null;
}

/** Scenari di una suite, ridotti al minimo che serve alla pagina candidato (niente rubrica/soluzioni). */
export function publicScenariosForSuite(suiteId) {
  const suite = getSuite(suiteId);
  if (!suite) return [];
  return suite.scenarioIds
    .map((id) => {
      const sc = resolveScenario(id);
      if (!sc) return null;
      return {
        id: sc.id,
        title: sc.title,
        description: sc.description,
        difficulty: sc.difficulty,
        maxMessages: sc.maxMessages || 8,
        openingHint: sc.fanPersonality?.name ? `Il fan si chiama ${sc.fanPersonality.name}.` : null,
      };
    })
    .filter(Boolean);
}

function newToken() {
  // 32 char URL-safe, non enumerabile.
  return randomBytes(24).toString("base64url");
}

function isExpired(a) {
  return !!a?.expiresAt && Date.now() > a.expiresAt;
}

/**
 * Crea un assessment e restituisce il record (con token).
 * `label` = nome del candidato, tenuto SOLO admin-side (non esposto nel flusso).
 */
export async function createAssessment({ label, suiteId, createdBy, ttlDays = DEFAULT_TTL_DAYS }) {
  const suite = getSuite(suiteId);
  if (!suite) throw new Error(`suite sconosciuta: ${suiteId}`);
  const token = newToken();
  const now = Date.now();
  const days = Number.isFinite(ttlDays) && ttlDays > 0 ? Math.min(60, ttlDays) : DEFAULT_TTL_DAYS;
  const record = {
    token,
    label: (label || "").toString().trim().slice(0, 120) || "Candidato senza nome",
    suiteId: suite.id,
    suiteName: suite.name,
    scenarioIds: suite.scenarioIds.slice(),
    status: ASSESSMENT_STATUS.INVITED,
    createdAt: now,
    createdBy: createdBy || null,
    ttlDays: days,
    expiresAt: now + days * 24 * 60 * 60 * 1000,
    consentAt: null,
    startedAt: null,
    completedAt: null,
    progress: { index: 0, results: [] },
    aggregate: null,
    outcome: { decision: null, employeeId: null, note: "", recordedAt: null, recordedBy: null },
  };
  await persist(record);
  await kv.zadd(INDEX_KEY, { score: now, member: token });
  return record;
}

async function persist(record) {
  // TTL del record = scadenza logica + margine per la lettura HR post-scadenza.
  const ttl = Math.max(
    60,
    Math.round((record.expiresAt - Date.now()) / 1000) + TTL_SECONDS_EXTRA
  );
  await kv.set(`${NS}:${record.token}`, record, { ex: ttl });
}

/**
 * Carica un assessment. Marca (e persiste) lo stato EXPIRED se scaduto e non
 * ancora completato. Ritorna null se inesistente.
 */
export async function getAssessment(token) {
  if (!token) return null;
  const rec = await kv.get(`${NS}:${token}`);
  if (!rec) return null;
  if (rec.status !== ASSESSMENT_STATUS.COMPLETED && isExpired(rec)) {
    if (rec.status !== ASSESSMENT_STATUS.EXPIRED) {
      rec.status = ASSESSMENT_STATUS.EXPIRED;
      await persist(rec);
    }
  }
  return rec;
}

/** Elenco per il pannello admin (summary, senza transcript). Più recenti prima. */
export async function listAssessments(limit = 100) {
  const tokens = (await kv.zrange(INDEX_KEY, 0, limit - 1, { rev: true })) || [];
  if (!tokens.length) return [];
  const recs = await Promise.all(tokens.map((t) => kv.get(`${NS}:${t}`)));
  return recs
    .filter(Boolean)
    .map((r) => {
      // Rifletti la scadenza anche in lista senza dover riscrivere ogni record.
      const status =
        r.status !== ASSESSMENT_STATUS.COMPLETED && isExpired(r)
          ? ASSESSMENT_STATUS.EXPIRED
          : r.status;
      return {
        token: r.token,
        label: r.label,
        suiteId: r.suiteId,
        suiteName: r.suiteName,
        status,
        createdAt: r.createdAt,
        createdBy: r.createdBy,
        expiresAt: r.expiresAt,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        progress: { index: r.progress?.index || 0, total: r.scenarioIds.length },
        aggregate: r.aggregate,
        outcome: r.outcome,
      };
    });
}

/** True se l'assessment può ancora ricevere turni/valutazioni. */
export function isActionable(a) {
  return !!a && a.status !== ASSESSMENT_STATUS.COMPLETED && !isExpired(a);
}

/** Lo scenario id atteso al passo corrente (o null se finito/non attivo). */
export function currentScenarioId(a) {
  if (!a || !Array.isArray(a.scenarioIds)) return null;
  const i = a.progress?.index || 0;
  return i < a.scenarioIds.length ? a.scenarioIds[i] : null;
}

/** Segna l'inizio (idempotente). */
export async function markStarted(token) {
  const rec = await getAssessment(token);
  if (!rec || !isActionable(rec)) return rec;
  if (rec.status === ASSESSMENT_STATUS.INVITED) {
    rec.status = ASSESSMENT_STATUS.IN_PROGRESS;
    rec.startedAt = Date.now();
    await persist(rec);
  }
  return rec;
}

/**
 * Registra l'accettazione dell'informativa (Decreto Trasparenza / L.132) e
 * avvia. Idempotente: il primo consenso resta l'evidenza. Ritorna il record
 * aggiornato o null/expired invariato se non azionabile.
 */
export async function recordConsent(token) {
  const rec = await getAssessment(token);
  if (!rec || !isActionable(rec)) return rec;
  if (!rec.consentAt) rec.consentAt = Date.now();
  if (rec.status === ASSESSMENT_STATUS.INVITED) {
    rec.status = ASSESSMENT_STATUS.IN_PROGRESS;
    rec.startedAt = rec.startedAt || Date.now();
  }
  await persist(rec);
  return rec;
}

function computeAggregate(results) {
  const scored = results.filter((r) => r && r.score);
  if (!scored.length) return null;
  const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const overalls = scored.map((r) => Number(r.score.overall) || 0);
  const stars = scored.map((r) => Number(r.score.stars) || 0);
  const violations = [];
  let compliancePass = true;
  for (const r of scored) {
    if (r.score.compliance && r.score.compliance.pass === false) {
      compliancePass = false;
      for (const v of r.score.compliance.violations || []) {
        violations.push({ scenarioId: r.scenarioId, scenarioTitle: r.scenarioTitle, violation: v });
      }
    }
  }
  return {
    overall_avg: avg(overalls),
    stars_avg: Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10,
    scenarios_done: scored.length,
    compliance_pass: compliancePass,
    compliance_violations: violations,
  };
}

/**
 * Registra il risultato di UNO scenario e avanza il progresso. Enforce l'ordine
 * (scenarioId deve essere quello atteso al passo corrente → niente replay/salti).
 * Al termine dell'ultimo scenario finalizza (status COMPLETED + aggregato).
 *
 * @returns {Promise<{ok:boolean, error?:string, status?:number, assessment?:object, done?:boolean}>}
 */
export async function recordScenarioResult(token, { scenarioId, scenarioTitle, score, messageCount }) {
  const rec = await getAssessment(token);
  if (!rec) return { ok: false, status: 404, error: "assessment non trovato" };
  if (!isActionable(rec)) {
    return { ok: false, status: 410, error: `assessment ${rec.status}` };
  }
  const expected = currentScenarioId(rec);
  if (scenarioId !== expected) {
    return { ok: false, status: 409, error: "scenario fuori sequenza", assessment: rec };
  }

  rec.progress.results.push({
    scenarioId,
    scenarioTitle: scenarioTitle || scenarioId,
    score,
    messageCount: messageCount || 0,
    at: Date.now(),
  });
  rec.progress.index = (rec.progress.index || 0) + 1;
  if (rec.status === ASSESSMENT_STATUS.INVITED) {
    rec.status = ASSESSMENT_STATUS.IN_PROGRESS;
    rec.startedAt = rec.startedAt || Date.now();
  }

  const done = rec.progress.index >= rec.scenarioIds.length;
  if (done) {
    rec.status = ASSESSMENT_STATUS.COMPLETED;
    rec.completedAt = Date.now();
    rec.aggregate = computeAggregate(rec.progress.results);
  }

  await persist(rec);
  return { ok: true, assessment: rec, done };
}

/**
 * Bridge V2: registra l'esito di hiring e l'aggancio all'employee (Clerk userId)
 * una volta assunto. È l'aggancio che rende possibile la validazione predittiva.
 */
export async function recordOutcome(token, { decision, employeeId, note, by }) {
  const rec = await getAssessment(token);
  if (!rec) return { ok: false, status: 404, error: "assessment non trovato" };
  const allowed = ["hired", "rejected", "pending", null];
  const dec = allowed.includes(decision) ? decision : null;
  rec.outcome = {
    decision: dec,
    employeeId: (employeeId || "").toString().trim() || null,
    note: (note || "").toString().trim().slice(0, 500),
    recordedAt: Date.now(),
    recordedBy: by || null,
  };
  await persist(rec);
  return { ok: true, assessment: rec };
}
