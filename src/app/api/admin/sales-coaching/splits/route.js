// Split del sales manager (insiemi di pagine). Gate: authorizeAll(SCORES_VIEW).
export const runtime = "nodejs";

import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { saveSplit, deleteSplit, listSplits } from "@/lib/sales-coaching";

export async function POST(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  try {
    const body = await request.json();
    const split = await saveSplit(body || {}, az.userId);
    return Response.json({ ok: true, split, splits: await listSplits() });
  } catch (e) {
    return Response.json({ error: e.message || "Salvataggio fallito" }, { status: 400 });
  }
}

export async function DELETE(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id mancante" }, { status: 400 });
  await deleteSplit(id);
  return Response.json({ ok: true, splits: await listSplits() });
}
