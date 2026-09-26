// Il percorso di allenamento assegnato all'operatore, letto da LUI (scope own).
// Prima /profilo lo prendeva da /api/admin/coaching-center (solo admin) → per gli
// operatori il blocco non compariva mai (verifica 26/09). Identità dal resolver
// server, mai dal client; si restituisce solo la SUA assegnazione.
import { kv } from "@vercel/kv";
import { resolveEmployeeForUser, normalizeName } from "@/lib/me";

const monthId = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export async function GET() {
  const who = await resolveEmployeeForUser();
  if (who.reason === "unauthenticated") return Response.json({ error: "Non autenticato." }, { status: 401 });
  if (!who.employee) return Response.json({ linked: false, assignment: null });
  const now = new Date();
  const periods = [monthId(now), monthId(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))];
  const target = normalizeName(who.employee);
  for (const p of periods) {
    const all = (await kv.get(`coaching_center:assignments:${p}`).catch(() => null)) || {};
    const key = Object.keys(all).find((k) => normalizeName(k) === target);
    const a = key ? all[key] : null;
    if (a && a.status === "assigned") {
      return Response.json({
        linked: true, period_id: p,
        assignment: {
          training_category_id: a.training_category_id || a.trainingCategoryId || null,
          deadline: a.deadline || null,
          note: a.note || null,
          // "owner" è il nome di chi segue (testo); se fosse un id utente non si mostra
          owner: typeof a.owner === "string" && !a.owner.startsWith("user_") ? a.owner : null,
          status: a.status,
        },
      });
    }
  }
  return Response.json({ linked: true, assignment: null });
}
