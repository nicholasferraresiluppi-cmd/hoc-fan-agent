/**
 * /api/admin/user-mapping — collega gli utenti Clerk al loro operatore.
 *
 * Completa il mapping via API (PR #38): elenca gli utenti, mostra lo stato del
 * collegamento e un suggerimento dal roster Infloww (per email), così un admin
 * collega con un click ancorando all'employeeId stabile — invece del curl.
 *
 * Capability: SEED (admin only).
 *
 * GET → { users: [{ userId, name, email, mapping, suggestion }] }
 *   mapping: stato attuale (override id-anchored | override legacy | auto | none)
 *   suggestion: match esatto dal roster su email, o null/ambiguo
 */
import { clerkClient } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { rosterMatchForEmail } from "@/lib/infloww-roster";

const USER_EMP_KEY = (userId) => `user_employee:${userId}`;

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let users = [];
  try {
    const cc = await clerkClient();
    const list = await cc.users.getUserList({ limit: 300, orderBy: "-created_at" });
    users = (list?.data || []).map((u) => ({
      userId: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses?.[0]?.emailAddress || u.id,
      email: u.emailAddresses?.[0]?.emailAddress || null,
    }));
  } catch (e) {
    return Response.json({ error: "Impossibile leggere gli utenti Clerk.", reason: String(e?.message || e) }, { status: 500 });
  }

  const rows = await Promise.all(
    users.map(async (u) => {
      // Stato mapping corrente
      let mapping = { status: "none" };
      try {
        const ov = await kv.get(USER_EMP_KEY(u.userId));
        if (ov && typeof ov === "object" && ov.employeeName) {
          mapping = { status: "override_anchored", employee: ov.employeeName, employee_id: ov.employeeId || null };
        } else if (ov) {
          mapping = { status: "override_legacy", employee: String(ov) };
        }
      } catch {}

      // Suggerimento dal roster (solo se non già ancorato)
      let suggestion = null;
      if (mapping.status !== "override_anchored" && u.email) {
        try {
          const s = await rosterMatchForEmail(u.email);
          if (s?.employeeName) suggestion = { employee: s.employeeName, employee_id: s.employeeId, match: s.match };
          else if (s?.ambiguous) suggestion = { ambiguous: true, candidates: s.candidates.map((c) => c.employeeName) };
        } catch {}
      }
      return { ...u, mapping, suggestion };
    })
  );

  // Ordina: non collegati prima (con suggerimento in cima), poi il resto.
  rows.sort((a, b) => {
    const rank = (r) => (r.mapping.status === "none" ? (r.suggestion && !r.suggestion.ambiguous ? 0 : 1) : 2);
    return rank(a) - rank(b) || (a.name || "").localeCompare(b.name || "");
  });

  return Response.json({ users: rows, count: rows.length });
}
