/**
 * POST /api/admin/members — sospendere, riattivare o eliminare l'accesso di un membro (27/09/2026).
 *   { userId, action: "suspend" }     → Clerk ban: sessioni chiuse, non può più entrare; ruoli e storico restano.
 *   { userId, action: "reactivate" }  → toglie la sospensione (tornano ruoli e dati di prima).
 *   { userId, action: "delete", confirm: "<email del membro>" } → account Clerk eliminato + ruoli rimossi. Definitivo.
 * Regole: solo admin veri (authorizeAdmin); mai su sé stessi; un admin non si sospende né si elimina
 * da qui (prima si toglie dagli admin in /admin/access: così non si resta mai senza admin per errore).
 * Ogni azione va nel registro accessi (audit:access).
 */
import { clerkClient } from "@clerk/nextjs/server";
import { authorizeAdmin, auditAccess, setUserRoles } from "@/lib/rbac";
import { isUserIdAdminRaw } from "@/lib/admin";
import { setAssignedCreators, personOf } from "@/lib/creator-scope";
import { buildCreatorMatrix } from "@/lib/creator-aggregates";
import { setSavedWorkspace } from "@/lib/workspace-store";
import { WORKSPACES } from "@/lib/workspaces";

// GET: le creator assegnabili (persone con turni nel mese corrente o nel precedente)
export async function GET() {
  const a = await authorizeAdmin();
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  const now = new Date();
  const ids = [0, 1].map((k) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; });
  const set = new Set();
  for (const pid of ids) {
    try { const { creators } = await buildCreatorMatrix(pid); for (const alias of Object.keys(creators || {})) set.add(personOf(alias)); } catch {}
  }
  return Response.json({ creators: [...set].filter(Boolean).sort((x, y) => x.localeCompare(y)) });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const a = await authorizeAdmin();
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  const userId = String(body?.userId || "").slice(0, 80);
  const action = body?.action;
  if (!/^user_[A-Za-z0-9]+$/.test(userId)) return Response.json({ error: "Membro non valido." }, { status: 400 });
  if (!["suspend", "reactivate", "delete", "creators", "workspace"].includes(action)) return Response.json({ error: "Azione non valida." }, { status: 400 });
  if (action === "creators") {
    const s = await setAssignedCreators(userId, body?.all ? { all: true } : { creators: body?.creators || [] }, a.userId);
    await auditAccess(a.userId, "member_creators", { target: userId, all: s.all, creators: s.creators });
    return Response.json({ ok: true, creators: s, text: s.all ? "Ora vede tutte le creator." : s.creators.length ? `Ora vede ${s.creators.length} creator.` : "Nessuna creator: non vede dati di vendita." });
  }
  // mansione (03/10/2026): menu e hub per il suo lavoro; "" = torna a quella del ruolo. Vale anche su sé stessi.
  if (action === "workspace") {
    let id;
    try { id = await setSavedWorkspace(userId, String(body?.workspace || ""), a.userId); } catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
    await auditAccess(a.userId, "member_workspace", { target: userId, workspace: id });
    return Response.json({ ok: true, workspace: id, text: id ? `Mansione: ${WORKSPACES[id].label}.` : "Mansione dal ruolo." });
  }
  if (userId === a.userId) return Response.json({ error: "Non puoi farlo sul tuo account." }, { status: 400 });

  const cc = await clerkClient();
  let user;
  try { user = await cc.users.getUser(userId); } catch { return Response.json({ error: "Membro non trovato." }, { status: 404 }); }
  const email = user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress || user.emailAddresses?.[0]?.emailAddress || "";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || email || userId;

  if (action !== "reactivate" && (await isUserIdAdminRaw(userId).catch(() => false))) {
    return Response.json({ error: `${name} è admin: prima toglilo dagli admin (Accessi), poi potrai sospenderlo.` }, { status: 400 });
  }

  try {
    if (action === "suspend") {
      await cc.users.banUser(userId);
    } else if (action === "reactivate") {
      await cc.users.unbanUser(userId);
    } else {
      if (!email || String(body?.confirm || "").trim().toLowerCase() !== email.toLowerCase()) {
        return Response.json({ error: "Per eliminare scrivi l'email del membro come conferma." }, { status: 400 });
      }
      await setUserRoles(userId, []).catch(() => {});
      await cc.users.deleteUser(userId);
    }
  } catch (e) {
    return Response.json({ error: `Clerk: ${String(e?.errors?.[0]?.message || e?.message || e)}` }, { status: 502 });
  }
  await auditAccess(a.userId, `member_${action}`, { target: userId, email });
  const done = { suspend: "sospeso: non può più entrare", reactivate: "riattivato", delete: "eliminato" }[action];
  return Response.json({ ok: true, text: `${name} ${done}.` });
}
