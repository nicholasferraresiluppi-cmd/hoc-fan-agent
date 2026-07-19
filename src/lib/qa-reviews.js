import { kv } from "@vercel/kv";

/**
 * QA conversazionale — implementa CAREER_LADDER §8.1 (il contrappeso qualità
 * dei gate): 3 conversazioni/mese per operatore, rubrica a 5 dimensioni scala
 * 1-4, pass = media ≥ 3 E nessun fail su compliance. Un fail compliance
 * congela qualsiasi promozione in corso.
 *
 * La rubrica è VERSIONATA (stessa disciplina della formula score): ogni review
 * registra la versione con cui è stata valutata.
 *
 * KV:
 *   qa:review:{id}        → oggetto review
 *   qa:reviews:all        → ZSET (score=created_at)
 *   qa:reviews:emp:{name} → set di id (lista own / storico gate)
 */

export const QA_RUBRIC_VERSION = "v1"; // CAREER_LADDER v0.5 §8.1

export const QA_DIMENSIONS = [
  { key: "compliance", label: "Compliance e safety", critical: true },
  { key: "brand_voice", label: "Aderenza a brand voice / persona creator", critical: false },
  { key: "sales_technique", label: "Tecnica di vendita non pressante", critical: false },
  { key: "retention", label: "Retention del fan (riaperture, follow-up)", critical: false },
  { key: "writing", label: "Qualità di scrittura", critical: false },
];

export const QA_PASS_AVG = 3; // media minima
export const QA_COMPLIANCE_FAIL_AT = 1; // compliance = 1 → fail automatico

const RKEY = (id) => `qa:review:${id}`;
const INDEX = "qa:reviews:all";
const EMP_INDEX = (employee) => `qa:reviews:emp:${employee}`;

/** Valuta pass/fail dalla rubrica (logica unica, usata da API e viste). */
export function evaluateScores(scores) {
  const vals = QA_DIMENSIONS.map((d) => Number(scores?.[d.key]));
  if (vals.some((v) => !Number.isInteger(v) || v < 1 || v > 4)) {
    return { valid: false };
  }
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const complianceFail = Number(scores.compliance) <= QA_COMPLIANCE_FAIL_AT;
  return {
    valid: true,
    avg: Number(avg.toFixed(2)),
    compliance_fail: complianceFail,
    pass: avg >= QA_PASS_AVG && !complianceFail,
  };
}

export async function createReview({ employee, periodId, reviewerId, conversationRef, scores, notes }) {
  const ev = evaluateScores(scores);
  if (!ev.valid) throw new Error("Ogni dimensione richiede un voto intero 1-4.");
  const ts = Date.now();
  const review = {
    id: `qa${ts.toString(36)}`,
    rubric_version: QA_RUBRIC_VERSION,
    employee,
    period_id: periodId,
    reviewer_id: reviewerId,
    conversation_ref: String(conversationRef || "").slice(0, 300),
    scores: Object.fromEntries(QA_DIMENSIONS.map((d) => [d.key, Number(scores[d.key])])),
    avg: ev.avg,
    compliance_fail: ev.compliance_fail,
    pass: ev.pass,
    notes: String(notes || "").slice(0, 1000),
    created_at: ts,
  };
  await kv.set(RKEY(review.id), review);
  await kv.zadd(INDEX, { score: ts, member: review.id });
  await kv.sadd(EMP_INDEX(employee), review.id);
  return review;
}

export async function getReview(id) {
  if (!id) return null;
  try {
    return (await kv.get(RKEY(id))) || null;
  } catch {
    return null;
  }
}

export async function listReviewsForEmployee(employee) {
  let ids = [];
  try {
    ids = (await kv.smembers(EMP_INDEX(employee))) || [];
  } catch {
    return [];
  }
  const out = [];
  for (const id of ids) {
    const r = await getReview(id);
    if (r) out.push(r);
  }
  out.sort((a, b) => b.created_at - a.created_at);
  return out;
}

export async function listAllReviews({ limit = 300 } = {}) {
  let ids = [];
  try {
    ids = (await kv.zrange(INDEX, 0, limit - 1, { rev: true })) || [];
  } catch {
    return [];
  }
  const out = [];
  for (const id of ids) {
    const r = await getReview(id);
    if (r) out.push(r);
  }
  return out;
}

/**
 * Stato QA di un operatore per i gate (CAREER_LADDER §4): guarda gli ultimi
 * `windowMonths` mesi di review. Ritorna null se non ci sono review nel periodo
 * (= non valutabile, non "fail").
 */
export function qaStatusForGate(reviews, { windowMonths = 3, now = Date.now() } = {}) {
  const cutoff = now - windowMonths * 31 * 24 * 3600 * 1000;
  const recent = (reviews || []).filter((r) => r.created_at >= cutoff);
  if (!recent.length) return null;
  const complianceFails = recent.filter((r) => r.compliance_fail).length;
  const passes = recent.filter((r) => r.pass).length;
  return {
    window_months: windowMonths,
    reviews: recent.length,
    passes,
    compliance_fails: complianceFails,
    // pass di periodo: nessun fail compliance E maggioranza di review passate
    pass: complianceFails === 0 && passes >= Math.ceil(recent.length / 2),
    frozen_by_compliance: complianceFails > 0,
  };
}
