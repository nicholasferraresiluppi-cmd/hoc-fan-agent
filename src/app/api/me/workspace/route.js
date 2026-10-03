// POST /api/me/workspace { workspace } — la persona sceglie la propria mansione (03/10/2026).
// Solo interfaccia: cambia menu e hub, non i permessi (ogni pagina e ogni API restano filtrate dai ruoli).
// "" = torna alla mansione del ruolo. In "Vedi come…" il middleware blocca le scritture.
import { auth } from "@clerk/nextjs/server";
import { setSavedWorkspace } from "@/lib/workspace-store";

export const runtime = "nodejs";

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  try {
    const id = await setSavedWorkspace(userId, String(body?.workspace || ""), userId);
    return Response.json({ ok: true, workspace: id });
  } catch (e) {
    return Response.json({ error: e.message || "Mansione non valida." }, { status: 400 });
  }
}
