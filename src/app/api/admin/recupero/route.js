/**
 * GET  /api/admin/recupero            → lista di oggi (solo le creator visibili all'utente) + stati + esito
 * POST /api/admin/recupero {key, status}  → segna un fan: "mandato" | "saltato" | null (annulla)
 *
 * Accesso: ANALYTICS_VIEW con le creator assegnate (come Analisi vendite). La lista non scrive mai ai
 * fan: propone, e chi la lavora decide.
 */
import { CAPABILITIES } from "@/lib/rbac";
import { authorizeScoped, allowsCreator } from "@/lib/creator-scope";
import { getList, getStates, setState, getOutcome, getJob, todayUTC } from "@/lib/recupero";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const az = await authorizeScoped(CAPABILITIES.ANALYTICS_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const data = await getList();
  const job = await getJob(todayUTC());
  if (!data) return Response.json({ empty: true, job: job && { status: job.status, stage: job.stage } });
  const list = data.list
    .map((g) => ({ ...g, fans: g.fans.filter((f) => allowsCreator(az.creatorScope, f.page)) }))
    .filter((g) => g.fans.length);
  const states = await getStates(list.flatMap((g) => g.fans.map((f) => f.key)));
  const outcome = await getOutcome().catch(() => ({ ready: false }));
  return Response.json({ day: data.day, computed_at: data.computed_at, list, states, outcome, job: job && { status: job.status, stage: job.stage } });
}

export async function POST(request) {
  const az = await authorizeScoped(CAPABILITIES.ANALYTICS_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  // si può segnare solo un fan che è nella lista dell'utente
  const data = await getList();
  const fan = data?.list.flatMap((g) => g.fans).find((f) => f.key === body.key);
  if (!fan || !allowsCreator(az.creatorScope, fan.page)) return Response.json({ error: "Fan non nella tua lista" }, { status: 403 });
  try {
    const st = await setState(body.key, body.status ?? null, { by: az.userId, day: data.day });
    return Response.json({ key: body.key, state: st });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
