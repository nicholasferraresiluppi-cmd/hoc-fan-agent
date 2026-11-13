// Trend modelle, livello 1 — API (permesso social.manage, come il Radar del clipping).
//
// GET                                          esplosi con descrizione, gruppi automatici, format, ultimo giro, spesa AI
// POST {action:"format_new", name, hitId?}     nuovo format (con il primo reel)
// POST {action:"format_add", id, hitId}        aggiunge un reel a un format
// POST {action:"format_remove", id, hitId}     toglie un reel da un format
// POST {action:"format_edit", id, name?, note?} rinomina / nota
// POST {action:"format_delete", id}            cancella il format (i reel restano negli esplosi)
// POST {action:"describe", hitId}              descrive adesso un reel (~1 cent)
// POST {action:"refresh"}                      rilegge il warehouse adesso (al massimo ogni 6 ore, ~0,17 $)
export const runtime = "nodejs";
export const maxDuration = 300;

import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { accessOf, noAccess } from "@/lib/clipping-access";
import { canWindow } from "@/lib/clipping-access-core";
import {
  loadAll, createFormat, addToFormat, removeFromFormat, editFormat, deleteFormat, describeHits, manualRefresh,
  bigQueryConfigured, aiConfigured,
} from "@/lib/trend-modelle";

const noStore = { headers: { "Cache-Control": "no-store" } };

async function gate() {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return { err: Response.json({ error: az.message }, { status: az.status }) };
  // ruoli Clipping (13/11/2026): la finestra deve essere concessa per almeno un account
  if (!canWindow(await accessOf(az.userId), "trend")) return { err: noAccess() };
  let name = az.userId;
  try { const u = await currentUser(); name = u?.fullName || u?.firstName || u?.primaryEmailAddress?.emailAddress || az.userId; } catch {}
  return { by: { userId: az.userId, name } };
}

export async function GET() {
  const g = await gate();
  if (g.err) return g.err;
  try {
    return Response.json({ configured: bigQueryConfigured(), ai: aiConfigured(), now: Date.now(), ...(await loadAll()) }, noStore);
  } catch (e) {
    return Response.json({ error: e?.message || "Errore di caricamento" }, { status: 500 });
  }
}

export async function POST(request) {
  const g = await gate();
  if (g.err) return g.err;
  const b = await request.json().catch(() => ({}));
  try {
    switch (b.action) {
      case "format_new": return Response.json(await createFormat(b, g.by));
      case "format_add": return Response.json(await addToFormat(b, g.by));
      case "format_remove": return Response.json(await removeFromFormat(b));
      case "format_edit": return Response.json(await editFormat(b));
      case "format_delete": await deleteFormat(b.id); return Response.json({ ok: true });
      case "describe": {
        if (!b.hitId) return Response.json({ error: "Manca il reel" }, { status: 400 });
        const r = await describeHits({ ids: [String(b.hitId)], max: 1 });
        if (r.skipped) return Response.json({ error: r.skipped }, { status: 503 });
        if (!r.described) return Response.json({ error: r.errors?.[0]?.replace(/^[^:]+: /, "") || "Descrizione non riuscita" }, { status: 502 });
        return Response.json(r);
      }
      case "refresh": {
        const r = await manualRefresh();
        if (!r.ok) return Response.json({ error: r.error || "Lettura non riuscita" }, { status: 502 });
        return Response.json(r);
      }
      default: return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: e?.message || "Operazione non riuscita" }, { status: e?.status || 500 });
  }
}
