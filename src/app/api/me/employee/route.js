/**
 * GET /api/me/employee
 *
 * Risolve l'employee_name dell'utente Clerk loggato basandosi sulla sua email.
 *
 * Strategie di match (in ordine):
 *   1. Override esplicito: `user_employee:{userId}` → employee_name (set da admin)
 *   2. Email locali: prende la parte prima di @, prova varianti
 *      (es. "mario.rossi" → "Mario Rossi", "mariorossi" → "Mario Rossi")
 *      e cerca match esatto o startsWith case-insensitive nella lista operatori
 *      della matrix corrente (ultimo periodo con dati).
 *
 * Response:
 *   { employee: "Mario Rossi", source: "override"|"email_match" }
 *   { employee: null, candidates: [...], email, reason: "no_match"|"ambiguous" }
 *
 * Auth: qualsiasi utente loggato.
 */
import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { resolveEmployeeForUser } from "@/lib/me";
import { isUserIdAdmin } from "@/lib/admin";

const USER_EMP_KEY = (userId) => `user_employee:${userId}`;

export async function GET() {
  const res = await resolveEmployeeForUser();
  if (res.reason === "unauthenticated") {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }
  const { userId, ...body } = res;
  return Response.json(body);
}

/**
 * POST: override manuale del mapping utente→operatore (solo admin).
 * Body: { user_id, employee }
 * Fix 2026-07-18: il check admin usava un set KV inesistente ("admin_users");
 * ora usa isUserIdAdmin (le 3 sorgenti ufficiali: env, Clerk metadata, admins:set).
 */
export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const admin = await isUserIdAdmin(userId);
  if (!admin) return Response.json({ error: "Non autorizzato." }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const { user_id, employee, employee_id } = body || {};
  if (!user_id || !employee) return Response.json({ error: "user_id e employee richiesti" }, { status: 400 });

  // Se l'admin passa l'employeeId (scelto dal roster Infloww), lo ancoriamo:
  // il collegamento sopravvive a refusi e cambi nome. Altrimenti stringa legacy.
  const value = employee_id ? { employeeId: String(employee_id), employeeName: String(employee) } : String(employee);
  await kv.set(USER_EMP_KEY(user_id), value);
  return Response.json({ ok: true, user_id, employee, employee_id: employee_id || null });
}

/**
 * DELETE ?user_id= — rimuove un override (solo admin).
 */
export async function DELETE(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const admin = await isUserIdAdmin(userId);
  if (!admin) return Response.json({ error: "Non autorizzato." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("user_id");
  if (!uid) return Response.json({ error: "user_id richiesto" }, { status: 400 });

  await kv.del(USER_EMP_KEY(uid));
  return Response.json({ ok: true, removed: uid });
}
