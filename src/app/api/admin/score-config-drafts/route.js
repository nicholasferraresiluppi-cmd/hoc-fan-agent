/**
 * /api/admin/score-config-drafts
 *
 * CRUD delle bozze della formula score operativo Infloww (backlog benchmark #6).
 * La formula ATTIVA resta in `ops_kpi:settings:*`: qui si lavora solo su bozze.
 * Publish e backtest hanno route dedicate (./publish, ./backtest).
 *
 * Capability richiesta: SEED (admin only).
 *
 * GET               → { drafts: [...] }
 * POST { name, note?, from? }        → crea bozza dalla formula attiva (o da un'altra bozza: from=id)
 * PUT  { id, name?, note?, weights?, thresholds?, tiers? } → aggiorna bozza (solo status=draft)
 * DELETE ?id=       → elimina bozza (qualsiasi stato; le archived sono audit, cancellarle è scelta esplicita)
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import {
  validateWeights,
  validateThresholds,
  validateTiers,
} from "@/app/api/admin/leaderboard-settings/route";
import {
  listDrafts,
  getDraft,
  saveDraft,
  deleteDraft,
  createDraft,
} from "@/lib/score-config-drafts";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const drafts = await listDrafts();
  return Response.json({ drafts });
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
  try {
    const draft = await createDraft({
      name: body?.name,
      note: body?.note || "",
      fromDraftId: body?.from || null,
      createdBy: az.userId || "",
    });
    return Response.json({ ok: true, draft });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}

export async function PUT(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { id, name, note, weights, thresholds, tiers } = body || {};
  const draft = await getDraft(id);
  if (!draft) return Response.json({ error: `Bozza "${id}" non trovata.` }, { status: 404 });
  if (draft.status !== "draft") {
    return Response.json({ error: `La bozza è "${draft.status}": solo le bozze attive si modificano.` }, { status: 400 });
  }

  if (weights !== undefined) {
    const err = validateWeights(weights);
    if (err) return Response.json({ error: `Weights non valido: ${err}` }, { status: 400 });
    draft.weights = weights;
  }
  if (thresholds !== undefined) {
    const err = validateThresholds(thresholds);
    if (err) return Response.json({ error: `Thresholds non valido: ${err}` }, { status: 400 });
    draft.thresholds = thresholds;
  }
  if (tiers !== undefined) {
    const err = validateTiers(tiers);
    if (err) return Response.json({ error: `Tiers non valido: ${err}` }, { status: 400 });
    draft.tiers = tiers;
  }
  if (name !== undefined) draft.name = String(name).slice(0, 80);
  if (note !== undefined) draft.note = String(note).slice(0, 500);

  // La formula è cambiata: un eventuale backtest precedente non è più valido.
  if (weights !== undefined || thresholds !== undefined || tiers !== undefined) {
    draft.backtest = null;
  }
  draft.updated_at = Date.now();
  await saveDraft(draft);
  return Response.json({ ok: true, draft });
}

export async function DELETE(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id." }, { status: 400 });
  const draft = await getDraft(id);
  if (!draft) return Response.json({ error: `Bozza "${id}" non trovata.` }, { status: 404 });
  await deleteDraft(id);
  return Response.json({ ok: true, deleted: id });
}
