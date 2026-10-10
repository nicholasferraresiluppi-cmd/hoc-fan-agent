// GET /api/admin/qualita/plan — le persone che il robot del giro impersona («Vedi come») e i loro compiti.
// Solo admin (SEED): lo chiama il robot loggato con l'account QA.
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { giroPlan } from "@/lib/qualita";
import { ERROR_TEXTS } from "@/lib/qualita-tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  return Response.json({ personas: await giroPlan(), errorTexts: ERROR_TEXTS });
}
