/**
 * /api/admin/schede-numeri — link «Scheda numeri» per le creator (19/11/2026).
 * GET              elenco dei link con stato
 * POST { name, note }   crea un link nuovo (30 giorni)
 * PATCH { token, action: "reopen" }  riapre una scheda inviata (7 giorni in più)
 * DELETE ?t=token  cancella scheda e screenshot (definitivo)
 * Gate: SCOUTING_USE, come il Radar creator (dati di persone esterne).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { createLink, listLinks, deleteLink, reopenLink, validToken, blobConfigured } from "@/lib/creator-numeri";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const az = await authorize(CAPABILITIES.SCOUTING_USE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  return Response.json({ links: await listLinks(), uploads: blobConfigured() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SCOUTING_USE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  if (!name) return Response.json({ error: "Scrivi per chi è il link." }, { status: 400 });
  const rec = await createLink({ name, note: body?.note, by: az.userId });
  return Response.json({ ok: true, token: rec.token });
}

export async function PATCH(request) {
  const az = await authorize(CAPABILITIES.SCOUTING_USE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  if (body?.action !== "reopen" || !validToken(body?.token)) return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  const rec = await reopenLink(body.token);
  if (!rec) return Response.json({ error: "Scheda non trovata." }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(request) {
  const az = await authorize(CAPABILITIES.SCOUTING_USE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const t = new URL(request.url).searchParams.get("t");
  if (!validToken(t)) return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  await deleteLink(t);
  return Response.json({ ok: true });
}
