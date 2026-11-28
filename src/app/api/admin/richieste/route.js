/**
 * /api/admin/richieste — Richieste alla modella, lato app (26/11/2026). Permesso social.manage.
 * GET              elenco delle richieste con stato + creator delle scrivanie di Editing
 * POST { creator, title, note, deadline, shots }   crea una richiesta (link pronto da mandare)
 * DELETE ?t=token  cancella richiesta e tutti i suoi file (definitivo)
 * Logica in lib/richieste*.js; pagina in app/admin/richieste, lato modella in app/richiesta/[token].
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { createRequest, listRequests, deleteRequest, validToken, blobConfigured } from "@/lib/richieste";
import { listDesks } from "@/lib/editing";
import { getLiveCreators } from "@/lib/live-creators-store";
import { slugify } from "@/lib/richieste-core";

// Le creator tra cui scegliere: quelle dello split (Revenue e chat) + le scrivanie di Editing, senza doppioni
function mergeCreators(desks = [], live = []) {
  const by = new Map();
  for (const c of [...desks.map((d) => ({ slug: d.slug, name: d.creator })), ...live.map((c) => ({ slug: c.slug, name: c.name }))]) {
    const key = slugify(c.name);
    if (key && !by.has(key)) by.set(key, { slug: c.slug || key, name: c.name });
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = (az) => Response.json({ error: az.message }, { status: az.status });

export async function GET() {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return deny(az);
  const [requests, desks, live] = await Promise.all([listRequests(), listDesks().catch(() => []), getLiveCreators().catch(() => [])]);
  return Response.json(
    { requests, creators: mergeCreators(desks, live), uploads: blobConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return deny(az);
  const body = await request.json().catch(() => ({}));
  const r = await createRequest(body, az.userId);
  return Response.json(r.ok ? r : { error: r.error, errors: r.errors }, { status: r.ok ? 200 : r.status });
}

export async function DELETE(request) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return deny(az);
  const t = new URL(request.url).searchParams.get("t");
  if (!validToken(t)) return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  const ok = await deleteRequest(t);
  return Response.json(ok ? { ok: true } : { error: "Richiesta non trovata." }, { status: ok ? 200 : 404 });
}
