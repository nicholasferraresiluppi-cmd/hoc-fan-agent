// Piani di lavoro (sprint in app) — API.
//
// GET                 piani visibili con il loro avanzamento
// GET ?id={id}        un piano valutato (voci, spunte, controlli automatici)
// GET ?area={area}    il piano in corso di un'area (per la scheda in cima alla pagina di lavoro)
// POST {action:"item", planId, itemId, done?, answer?}   spunta o risposta su una voce
// POST {action:"save", plan}                            crea / aggiorna un piano (solo admin)
//
// Chi vede un piano: gli admin tutti; gli altri i piani la cui capability (`cap`) hanno
// (es. social.manage per il piano Social).
export const runtime = "nodejs";

import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isUserIdAdmin } from "@/lib/admin";
import { listPlans, getPlan, loadEvaluated, setItem, savePlan } from "@/lib/piani";

const noStore = { headers: { "Cache-Control": "no-store" } };

async function gate() {
  const [admin, social] = await Promise.all([authorize(CAPABILITIES.SEED), authorize(CAPABILITIES.SOCIAL_MANAGE)]);
  const userId = admin.userId || social.userId;
  if (!userId) return { err: Response.json({ error: "unauthenticated" }, { status: 401 }) };
  const isAdmin = admin.ok || (await isUserIdAdmin(userId).catch(() => false));
  if (!isAdmin && !social.ok) return { err: Response.json({ error: "Non hai il permesso per questa azione" }, { status: 403 }) };
  const caps = new Set([...(social.ok ? ["social.manage"] : [])]);
  let name = userId;
  try { const u = await currentUser(); name = u?.fullName || u?.firstName || name; } catch {}
  return { by: { userId, name }, admin: isAdmin, canSee: (p) => isAdmin || (p.cap && caps.has(p.cap)) };
}

export async function GET(request) {
  const g = await gate();
  if (g.err) return g.err;
  const sp = new URL(request.url).searchParams;
  const me = { name: g.by.name, admin: g.admin };
  if (sp.get("id")) {
    const def = await getPlan(sp.get("id"));
    if (!def || !g.canSee(def)) return Response.json({ error: "Piano non trovato" }, { status: 404 });
    return Response.json({ plan: await loadEvaluated(def.id), me }, noStore);
  }
  const plans = (await listPlans()).filter(g.canSee);
  if (sp.get("area")) {
    const def = plans.find((p) => p.area === sp.get("area") && !p.archived);
    return Response.json({ plan: def ? await loadEvaluated(def.id) : null, me }, noStore);
  }
  const evaluated = await Promise.all(plans.map((p) => loadEvaluated(p.id)));
  return Response.json({ plans: evaluated.filter(Boolean), me }, noStore);
}

export async function POST(request) {
  const g = await gate();
  if (g.err) return g.err;
  const body = await request.json().catch(() => ({}));
  if (body.action === "save") {
    if (!g.admin) return Response.json({ error: "I piani li scrive un amministratore" }, { status: 403 });
    const r = await savePlan(body.plan);
    return r.ok ? Response.json({ ok: true, plan: r.plan }) : Response.json({ error: r.errors.join(" · ") }, { status: 400 });
  }
  if (body.action === "item") {
    const def = await getPlan(String(body.planId || ""));
    if (!def || !g.canSee(def)) return Response.json({ error: "Piano non trovato" }, { status: 404 });
    const patch = {};
    if ("done" in body) patch.done = Boolean(body.done);
    if ("answer" in body) patch.answer = String(body.answer || "");
    const r = await setItem(def.id, String(body.itemId || ""), patch, g.by);
    if (!r.ok) return Response.json({ error: r.errors.join(" · ") }, { status: r.status || 400 });
    return Response.json({ ok: true, plan: await loadEvaluated(def.id) });
  }
  return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
}
