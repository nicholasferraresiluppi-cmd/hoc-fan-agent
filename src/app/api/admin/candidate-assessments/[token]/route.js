/**
 * /api/admin/candidate-assessments/[token] — dettaglio + esito (SEED).
 *
 * GET   → assessment completo, incluso il report per HR (score per scenario,
 *         aggregato, compliance). È qui che vive la valutazione — MAI esposta al
 *         candidato.
 * PATCH → registra l'esito di hiring (bridge V2): { decision, employeeId, note }.
 *         L'aggancio employeeId è ciò che un domani permette di correlare lo
 *         score del candidato con la resa reale sul vivo.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getAssessment, recordOutcome } from "@/lib/candidate-assessments";
import { logAuditAction } from "@/lib/audit-log";

export async function GET(request, { params }) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const item = await getAssessment(params?.token);
  if (!item) return Response.json({ error: "Non trovato" }, { status: 404 });
  return Response.json({ item });
}

export async function PATCH(request, { params }) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await recordOutcome(params?.token, {
    decision: body?.decision,
    employeeId: body?.employeeId,
    note: body?.note,
    by: az.userId,
  });
  if (!result.ok) {
    return Response.json({ error: result.error || "Errore" }, { status: result.status || 500 });
  }

  await logAuditAction({
    action: "candidate-assessment.outcome",
    target: params.token,
    by: az.userId,
    meta: { decision: result.assessment.outcome.decision, employeeId: result.assessment.outcome.employeeId },
  });

  return Response.json({ ok: true, item: result.assessment });
}
