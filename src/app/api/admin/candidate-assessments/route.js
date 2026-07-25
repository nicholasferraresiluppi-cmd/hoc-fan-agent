/**
 * /api/admin/candidate-assessments — gestione link assessment candidati (SEED).
 *
 * GET  → { items, suites }  (lista summary + suite disponibili per il form)
 * POST → crea un link { label, suiteId, ttlDays? } → { ok, item, path }
 *
 * GATE: SEED (admin-only) — la superficie tratta dati di selezione del personale
 * (nome candidato, valutazione), stessa classe PII di employee-profiles.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { createAssessment, listAssessments, listSuites } from "@/lib/candidate-assessments";
import { logAuditAction } from "@/lib/audit-log";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const items = await listAssessments(200);
  return Response.json({ items, suites: listSuites() });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { label, suiteId, ttlDays } = body || {};
  if (!label || typeof label !== "string" || !label.trim()) {
    return Response.json({ error: "label (nome candidato) richiesto" }, { status: 400 });
  }
  if (!suiteId || !listSuites().some((s) => s.id === suiteId)) {
    return Response.json({ error: "suiteId non valido" }, { status: 400 });
  }

  let item;
  try {
    item = await createAssessment({
      label: label.trim(),
      suiteId,
      createdBy: az.userId,
      ttlDays: Number.isFinite(ttlDays) ? ttlDays : undefined,
    });
  } catch (e) {
    return Response.json({ error: e.message || "Creazione fallita" }, { status: 500 });
  }

  await logAuditAction({
    action: "candidate-assessment.create",
    target: item.token,
    by: az.userId,
    meta: { label: item.label, suiteId: item.suiteId },
  });

  return Response.json({ ok: true, item, path: `/assessment/${item.token}` });
}
