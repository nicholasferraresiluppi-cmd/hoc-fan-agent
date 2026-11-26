// GET /api/admin/salary-modelle — le modelle salary dalla lista ClickUp «Candidate», col passo del
// percorso in cui si trovano (26/11/2026). ?force=1 salta la cache di 5 minuti.
// Admin (SEED): dentro ci sono dati personali delle modelle e le cifre del deal.
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getSalaryModels } from "@/lib/salary-modelle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const force = new URL(request.url).searchParams.get("force") === "1";
  try {
    return Response.json(await getSalaryModels({ force }));
  } catch (e) {
    return Response.json({ error: e?.message || "Errore nel leggere ClickUp." }, { status: e?.status || 502 });
  }
}
