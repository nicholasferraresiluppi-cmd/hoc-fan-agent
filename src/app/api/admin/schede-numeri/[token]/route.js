// GET /api/admin/schede-numeri/[token] — una scheda: risposte + screenshot (SCOUTING_USE).
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getRecord, listFiles } from "@/lib/creator-numeri";
import { linkState } from "@/lib/creator-numeri-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, props) {
  const az = await authorize(CAPABILITIES.SCOUTING_USE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { token } = await props.params;
  const rec = await getRecord(token);
  if (!rec) return Response.json({ error: "Scheda non trovata." }, { status: 404 });
  const files = (await listFiles(token)).map(({ pathname, step, at, size }) => ({ pathname, step, at, size }));
  return Response.json({ ...rec, state: linkState(rec), files }, { headers: { "Cache-Control": "no-store" } });
}
