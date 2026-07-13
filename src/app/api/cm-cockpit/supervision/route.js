/**
 * /api/cm-cockpit/supervision — apertura/chiusura turno di supervisione CM.
 *
 * GET  → supervisione attiva dell'utente corrente (null se nessuna)
 * POST { action: "open", window: {startedAt, endedAt}, operators: [...] }
 * POST { action: "close", summary?: {...} }
 *
 * Questo è IL tracciamento supervisioni (prerequisito override §10.3):
 * nasce dall'uso del cockpit, non da un form. Gli operatori devono venire
 * dal roster timeline; off_schedule=true marca le eccezioni fuori
 * programma (visibili al SM come segnale di igiene scheduling).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getActiveSupervision, openSupervision, closeSupervision } from "@/lib/cm-cockpit";
import { clerkClient } from "@clerk/nextjs/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET() {
  const az = await authorize(CAPABILITIES.CM_COCKPIT);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const sup = await getActiveSupervision(az.userId);
  return Response.json({ active: sup });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.CM_COCKPIT);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON body richiesto" }, { status: 400 });
  }

  try {
    if (body.action === "open") {
      const { window, operators } = body;
      if (!window?.startedAt || !window?.endedAt) {
        return Response.json({ error: "window {startedAt, endedAt} richiesta" }, { status: 400 });
      }
      const clean = (Array.isArray(operators) ? operators : []).map((op) => ({
        member_id: op.member_id || null,
        member_name: String(op.member_name || "").slice(0, 80),
        creator_id: op.creator_id || null,
        creator_alias: op.creator_alias || null,
        shift_id: op.shift_id || null,
        payment_profile: op.payment_profile
          ? { name: String(op.payment_profile.name || "").slice(0, 80), cosellers_count: op.payment_profile.cosellers_count ?? null }
          : null,
        off_schedule: Boolean(op.off_schedule),
      }));
      let cmName = null;
      try {
        const client = await clerkClient();
        const u = await client.users.getUser(az.userId);
        cmName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || null;
      } catch { /* nome opzionale */ }
      const sup = await openSupervision({ userId: az.userId, cmName, window, operators: clean });
      return Response.json({ ok: true, supervision: sup });
    }

    if (body.action === "close") {
      const sup = await closeSupervision({
        userId: az.userId,
        summary: body.summary || null,
        notes: Array.isArray(body.notes) ? body.notes : null,
      });
      return Response.json({ ok: true, supervision: sup });
    }

    return Response.json({ error: "action deve essere open|close" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
