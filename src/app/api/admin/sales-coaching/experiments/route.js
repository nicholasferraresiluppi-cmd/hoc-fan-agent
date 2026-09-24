// Test in corso (es. "operatori forti su Martina per 2 settimane").
// Gate: authorizeAll(SCORES_VIEW).
export const runtime = "nodejs";

import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { saveExperiment, deleteExperiment } from "@/lib/sales-coaching";

export async function POST(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  try {
    const body = await request.json();
    const experiment = await saveExperiment(body || {}, az.userId);
    return Response.json({ ok: true, experiment });
  } catch (e) {
    return Response.json({ error: e.message || "Salvataggio fallito" }, { status: 400 });
  }
}

export async function DELETE(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id mancante" }, { status: 400 });
  await deleteExperiment(id);
  return Response.json({ ok: true });
}
