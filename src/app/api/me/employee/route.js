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
import { auth, currentUser } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { buildCreatorMatrix } from "@/lib/creator-aggregates";

const USER_EMP_KEY = (userId) => `user_employee:${userId}`;

function normalize(s) {
  return (s || "").toLowerCase().replace(/[\s._-]+/g, "");
}

async function findLatestPeriod() {
  // Scansiona ultimi 24 mesi per cp:wages:* non vuoti, ritorna il più recente
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const pid = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const wages = await kv.get(`cp:wages:${pid}`);
    if (Array.isArray(wages) && wages.length > 0) return pid;
  }
  return null;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

  // 1. Override esplicito
  const override = await kv.get(USER_EMP_KEY(userId));
  if (override) {
    return Response.json({ employee: override, source: "override" });
  }

  // 2. Email match
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress || null;
  if (!email) return Response.json({ employee: null, email: null, reason: "no_email" });

  const local = email.split("@")[0] || "";
  const normLocal = normalize(local);

  // Carica lista operatori dall'ultimo periodo con dati
  const periodId = await findLatestPeriod();
  if (!periodId) return Response.json({ employee: null, email, reason: "no_cp_data" });

  const { operators } = await buildCreatorMatrix(periodId);
  const names = Object.keys(operators || {});

  // Match esatto normalizzato (es. "mario.rossi" → normalize "mariorossi" === normalize "Mario Rossi")
  const exact = names.filter((n) => normalize(n) === normLocal);
  if (exact.length === 1) {
    return Response.json({ employee: exact[0], source: "email_match", email });
  }
  if (exact.length > 1) {
    return Response.json({ employee: null, candidates: exact, email, reason: "ambiguous" });
  }

  // StartsWith / contiene (per email truncate o con suffissi)
  const partial = names.filter((n) => {
    const nn = normalize(n);
    return nn.startsWith(normLocal) || normLocal.startsWith(nn);
  });
  if (partial.length === 1) {
    return Response.json({ employee: partial[0], source: "email_match_partial", email });
  }
  if (partial.length > 1) {
    return Response.json({ employee: null, candidates: partial.slice(0, 5), email, reason: "ambiguous" });
  }

  return Response.json({ employee: null, email, reason: "no_match", period_id: periodId });
}

/**
 * POST: override manuale del mapping (per ora solo admin via UI / cURL).
 * Body: { user_id, employee }
 */
export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

  // Solo admin (riusa il check via whoami stesso pattern — semplificato)
  const isAdmin = await kv.sismember("admin_users", userId);
  if (!isAdmin) return Response.json({ error: "Non autorizzato." }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const { user_id, employee } = body || {};
  if (!user_id || !employee) return Response.json({ error: "user_id e employee richiesti" }, { status: 400 });

  await kv.set(USER_EMP_KEY(user_id), employee);
  return Response.json({ ok: true, user_id, employee });
}
