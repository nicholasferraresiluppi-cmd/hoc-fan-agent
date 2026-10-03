/**
 * /api/me/allenatore — il feedback del sales manager AI per l'operatore loggato.
 *
 * Scope OWN: l'operatore lo risolve il server (resolveEmployeeForUser), mai il
 * client. Arrivano SOLO i feedback rivisti da una persona (approvato/modificato)
 * e solo se la direzione ha acceso la visibilità agli operatori (gate legale:
 * all'inizio è spenta). L'admin in "Vedi come operatore" li vede comunque, in
 * sola lettura.
 *
 * POST {day, key, commitment?, rating?: "utile"|"non_utile", note?}
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { resolveEmployeeForUser, normalizeName } from "@/lib/me";
import * as S from "@/lib/sales-ai/store";
import { LEVERS } from "@/lib/sales-ai/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISIBLE = ["approvato", "modificato"];

async function mine() {
  const who = await resolveEmployeeForUser();
  if (!who?.employee) return { who, items: [] };
  const target = normalizeName(who.employee);
  const days = await S.listDays(21);
  const items = [];
  for (const day of days) {
    const job = await S.getJob(day);
    for (const o of job?.operators || []) {
      if (normalizeName(o.operator) !== target) continue;
      const fb = await S.getFeedback(day, o.key);
      if (!fb || !VISIBLE.includes(fb.status)) continue;
      const reply = await S.getReply(day, o.key);
      items.push({
        day, key: o.key, message: fb.edited_message || fb.message,
        leva: fb.arbiter?.regola?.leva && fb.arbiter.regola.leva !== "nessuna" ? { id: fb.arbiter.regola.leva, titolo: LEVERS[fb.arbiter.regola.leva]?.titolo } : null,
        reply: reply ? { commitment: reply.commitment || null, rating: reply.rating || null, note: reply.note || null } : null,
      });
    }
  }
  return { who, items };
}

export async function GET() {
  const az = await authorize(CAPABILITIES.COPILOT_PILOT);
  if (!az.ok) return Response.json({ error: "Pagina in pilota: chiedi l'abilitazione a un admin." }, { status: az.status || 403 });
  const cfg = await S.getConfig();
  const { who, items } = await mine();
  if (!who?.employee) return Response.json({ linked: false, reason: who?.reason || "no_match" });
  const preview = who.source === "view_as";
  if (!cfg.operator_visible && !preview) return Response.json({ linked: true, active: false, items: [] });
  return Response.json({ linked: true, active: true, preview, employee: who.employee, items });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.COPILOT_PILOT);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status || 403 });
  const cfg = await S.getConfig();
  const body = await request.json().catch(() => ({}));
  const { who, items } = await mine();
  if (!who?.employee) return Response.json({ error: "Account non collegato a un operatore." }, { status: 403 });
  if (who.source === "view_as") return Response.json({ error: "Anteprima in sola lettura." }, { status: 403 });
  if (!cfg.operator_visible) return Response.json({ error: "Non ancora attivo." }, { status: 403 });
  const it = items.find((x) => x.day === body.day && x.key === body.key);
  if (!it) return Response.json({ error: "Feedback non trovato." }, { status: 404 });
  const prev = (await S.getReply(it.day, it.key)) || {};
  const next = { ...prev };
  if (typeof body.commitment === "string") next.commitment = body.commitment.trim().slice(0, 500) || null;
  if (body.rating === "utile" || body.rating === "non_utile") next.rating = body.rating;
  if (typeof body.note === "string") next.note = body.note.trim().slice(0, 500) || null;
  await S.saveReply(it.day, it.key, next);
  await S.event("valutazione", `Risposta di un operatore${next.rating ? ` (${next.rating === "utile" ? "utile" : "non utile"})` : ""}`, { day: it.day });
  return Response.json({ ok: true, reply: next });
}
