// Ruoli della dashboard Clipping — API (13/11/2026). SOLO admin: crea, modifica, elimina, assegna, attiva.
//
// GET                                   ruoli + interruttore «Ruoli attivi» + account del warm-up + persone
// POST {action:"save", role}            nuovo ruolo o modifica ({id?, name, grants:{accountId:[finestre]}, users:[userId]})
// POST {action:"delete", id}            elimina un ruolo
// POST {action:"active", on}            accende / spegne i ruoli (spenti = tutti vedono tutto, come prima)
export const runtime = "nodejs";

import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isUserIdAdmin } from "@/lib/admin";
import { loadState, listPeople } from "@/lib/warmup-store";
import { loadRoles, saveRoles } from "@/lib/clipping-access";
import { cleanRole } from "@/lib/clipping-access-core";

const noStore = { headers: { "Cache-Control": "no-store" } };

async function gate() {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return { err: Response.json({ error: az.message }, { status: az.status }) };
  if (!(await isUserIdAdmin(az.userId).catch(() => false))) return { err: Response.json({ error: "I ruoli li gestisce solo un amministratore" }, { status: 403 }) };
  let name = az.userId;
  try { const u = await currentUser(); name = u?.fullName || u?.firstName || u?.primaryEmailAddress?.emailAddress || az.userId; } catch {}
  return { by: { userId: az.userId, name } };
}

async function accounts() {
  const st = await loadState();
  return st.profiles.filter((p) => !p.archived).map((p) => ({ id: p.id, username: p.username, platform: p.platform === "x" ? "x" : "ig", creator: p.creator || null }))
    .sort((a, b) => a.platform.localeCompare(b.platform) || String(a.username).localeCompare(String(b.username)));
}

export async function GET() {
  const g = await gate();
  if (g.err) return g.err;
  const [doc, accs, people] = await Promise.all([loadRoles(), accounts(), listPeople()]);
  return Response.json({ ...doc, accounts: accs, people }, noStore);
}

export async function POST(request) {
  const g = await gate();
  if (g.err) return g.err;
  const body = await request.json().catch(() => ({}));
  const doc = await loadRoles();
  if (body.action === "active") {
    return Response.json(await saveRoles({ ...doc, active: Boolean(body.on) }));
  }
  if (body.action === "delete") {
    const id = String(body.id || "");
    if (!doc.roles.some((r) => r.id === id)) return Response.json({ error: "Ruolo non trovato" }, { status: 404 });
    return Response.json(await saveRoles({ ...doc, roles: doc.roles.filter((r) => r.id !== id) }));
  }
  if (body.action === "save") {
    const accs = await accounts();
    const r = cleanRole(body.role || {}, { accountIds: accs.map((a) => a.id), by: g.by.name });
    if (!r.ok) return Response.json({ error: r.errors.join("; ") }, { status: 400 });
    if (doc.roles.some((x) => x.id !== r.role.id && x.name.toLowerCase() === r.role.name.toLowerCase())) return Response.json({ error: "Esiste già un ruolo con questo nome" }, { status: 400 });
    const roles = doc.roles.some((x) => x.id === r.role.id) ? doc.roles.map((x) => (x.id === r.role.id ? r.role : x)) : [...doc.roles, r.role];
    return Response.json({ ...(await saveRoles({ ...doc, roles })), saved: r.role.id });
  }
  return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
}
