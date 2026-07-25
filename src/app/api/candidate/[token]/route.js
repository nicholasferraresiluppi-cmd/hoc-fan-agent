/**
 * /api/candidate/[token]  — contesto dell'assessment (pubblico, self-guarding).
 *
 * GET  → contesto per la pagina /assessment/[token] (stato, suite, scenari
 *        "public" senza rubrica, progresso, se serve il consenso). Mai lo score.
 * POST → registra l'accettazione dell'informativa e avvia (recordConsent).
 *
 * Nessuna auth Clerk: il token È l'auth. La difesa (validità/scadenza/stato) è
 * qui e in lib/candidate-assessments.
 */
export const runtime = "nodejs";

import {
  getAssessment,
  recordConsent,
  publicScenariosForSuite,
  currentScenarioId,
  ASSESSMENT_STATUS,
} from "@/lib/candidate-assessments";

function toContext(rec) {
  return {
    ok: true,
    status: rec.status,
    suiteName: rec.suiteName,
    expiresAt: rec.expiresAt,
    consentRequired: !rec.consentAt,
    done: rec.status === ASSESSMENT_STATUS.COMPLETED,
    expired: rec.status === ASSESSMENT_STATUS.EXPIRED,
    progress: { index: rec.progress?.index || 0, total: rec.scenarioIds.length },
    currentScenarioId: currentScenarioId(rec),
    scenarios: publicScenariosForSuite(rec.suiteId),
  };
}

export async function GET(request, { params }) {
  const rec = await getAssessment(params?.token);
  if (!rec) return Response.json({ ok: false, error: "Link non valido." }, { status: 404 });
  return Response.json(toContext(rec));
}

export async function POST(request, { params }) {
  const rec = await getAssessment(params?.token);
  if (!rec) return Response.json({ ok: false, error: "Link non valido." }, { status: 404 });
  if (rec.status === ASSESSMENT_STATUS.COMPLETED) {
    return Response.json({ ...toContext(rec) });
  }
  if (rec.status === ASSESSMENT_STATUS.EXPIRED) {
    return Response.json({ ok: false, error: "Questo link è scaduto." }, { status: 410 });
  }
  const updated = await recordConsent(params.token);
  return Response.json(toContext(updated));
}
