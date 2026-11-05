/**
 * GET  /api/admin/benvenuto → prezzi del benvenuto inseriti a mano sulle pagine visibili + pagine
 * POST /api/admin/benvenuto { action: "save", id?, creator_id, price, from, to?, tool?, note? }
 *                           { action: "delete", id }
 *
 * Benvenuto a pagamento (lib/welcome-tracking*). I numeri (iscritti, sblocchi) arrivano dalla vista
 * `welcome` di /api/admin/analisi-vendite; qui si gestiscono solo i prezzi a mano.
 * Accesso: come Analisi vendite (ANALYTICS_VIEW, visibilità di squadra o totale); si scrive solo
 * sulle pagine assegnate a chi scrive (creator-scope).
 */
import { currentUser } from "@clerk/nextjs/server";
import { CAPABILITIES } from "@/lib/rbac";
import { authorizeScoped } from "@/lib/creator-scope";
import { visibleCreators } from "@/lib/analisi-vendite";
import { listRules, saveRule, deleteRule } from "@/lib/welcome-tracking";

export const runtime = "nodejs";

async function gate() {
  const az = await authorizeScoped(CAPABILITIES.ANALYTICS_VIEW);
  if (!az.ok) return { err: Response.json({ error: az.message }, { status: az.status }) };
  const creators = await visibleCreators(az.creatorScope);
  const visible = new Set(creators.map((c) => c.id));
  let userName = null;
  try {
    const u = await currentUser();
    const local = String(u?.primaryEmailAddress?.emailAddress || "").split("@")[0].split(/[._-]/)[0];
    userName = u?.fullName || u?.firstName || (local ? local[0].toUpperCase() + local.slice(1) : null);
  } catch {}
  return { az, creators, allowed: (id) => visible.has(Number(id)), userName };
}

export async function GET() {
  const g = await gate();
  if (g.err) return g.err;
  try {
    const names = Object.fromEntries(g.creators.map((c) => [c.id, c.name]));
    const rules = (await listRules())
      .filter((r) => g.allowed(r.creator_id))
      .map((r) => ({ ...r, name: names[Number(r.creator_id)] || `Creator ${r.creator_id}` }))
      .sort((a, b) => a.name.localeCompare(b.name, "it") || b.from.localeCompare(a.from));
    return Response.json({ creators: g.creators, rules });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura non riuscita" }, { status: 500 });
  }
}

export async function POST(request) {
  const g = await gate();
  if (g.err) return g.err;
  const body = await request.json().catch(() => ({}));
  const who = { userId: g.az.userId, userName: g.userName, allowed: g.allowed };
  try {
    const out = body.action === "delete" ? await deleteRule(String(body.id || ""), who)
      : body.action === "save" ? await saveRule(body, who)
      : { ok: false, status: 400, error: "Azione sconosciuta" };
    if (!out.ok) return Response.json({ error: out.error }, { status: out.status || 400 });
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: e.message || "Salvataggio non riuscito" }, { status: 500 });
  }
}
