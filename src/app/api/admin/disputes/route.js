/**
 * /api/admin/disputes — coda e risoluzione contestazioni (CAREER_LADDER §8.2).
 *
 * Capability: authorizeAll(SCORES_VIEW) — chi può vedere score/denaro di tutti
 * (admin, sales manager, qa_reviewer) può esaminare le contestazioni. Il
 * principio §8.2 "mai il proprio TL da solo" è garantito a monte: team_lead ha
 * scope team e qui riceve 403.
 *
 * GET  ?status=open|accepted|partial|rejected → { disputes: [...] }
 * PUT  { id, status: accepted|partial|rejected, resolution_note } → risolve.
 *      La risoluzione è definitiva e registrata (audit); una contestazione non
 *      si cancella mai. Se accolta (accepted/partial), la correzione dei dati va
 *      fatta coi flussi tracciati (re-import / sync) — mai edit silenziosi:
 *      questa API registra l'esito, non riscrive i numeri.
 */
import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { getDispute, saveDispute, listAllDisputes, CLOSED_STATUSES, OPEN_STATUS } from "@/lib/disputes";

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  if (status && status !== OPEN_STATUS && !CLOSED_STATUSES.includes(status)) {
    return Response.json({ error: "status non valido." }, { status: 400 });
  }
  const disputes = await listAllDisputes({ status: status || null });
  return Response.json({ disputes });
}

export async function PUT(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { id, status, resolution_note } = body || {};
  if (!CLOSED_STATUSES.includes(status)) {
    return Response.json({ error: `status deve essere uno di: ${CLOSED_STATUSES.join(", ")}.` }, { status: 400 });
  }
  if (!resolution_note || String(resolution_note).trim().length < 10) {
    return Response.json({ error: "La motivazione della risoluzione è obbligatoria (min 10 caratteri): l'operatore la leggerà." }, { status: 400 });
  }

  const dispute = await getDispute(id);
  if (!dispute) return Response.json({ error: `Contestazione "${id}" non trovata.` }, { status: 404 });
  if (dispute.status !== OPEN_STATUS) {
    return Response.json({ error: `Già risolta (${dispute.status}): le risoluzioni sono definitive e non si riscrivono.` }, { status: 400 });
  }

  dispute.status = status;
  dispute.resolution_note = String(resolution_note).slice(0, 1000);
  dispute.resolved_at = Date.now();
  dispute.resolved_by = az.userId || "";
  await saveDispute(dispute);
  return Response.json({ ok: true, dispute });
}
