// Supervisor account social — API (permesso social.manage: admin e ruolo "Social").
//
// GET                         account, telefoni, caselle (senza segreti) + panoramica + cose da sistemare
// GET ?audit=1[&kind&id]      registro: chi ha visto una password, chi ha cambiato cosa
// POST {action:"save",   kind, id?, fields, secrets?}   crea/modifica (secrets: campo → valore | null per cancellare)
// POST {action:"delete", kind, id}
// POST {action:"reveal", kind, id, field}               una password in chiaro, registrata
// POST {action:"import", kind, rows, mapping, dryRun?}  righe di un CSV (il file si legge nel browser)

export const runtime = "nodejs";
export const maxDuration = 60;

import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { KINDS, buildView, overviewStats, findIssues, rowsToInputs } from "@/lib/supervisor-core";
import { loadAll, upsert, remove, revealSecret, importRows, getAudit, cryptoConfigured } from "@/lib/supervisor-store";

const noStore = { headers: { "Cache-Control": "no-store" } };

async function whoName(userId) {
  try {
    const u = await currentUser();
    return u?.fullName || u?.primaryEmailAddress?.emailAddress || userId;
  } catch { return userId; }
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const sp = new URL(request.url).searchParams;
  if (sp.get("audit")) {
    const log = await getAudit({ limit: 200, kind: sp.get("kind") || undefined, id: sp.get("id") || undefined });
    return Response.json({ log }, noStore);
  }
  const view = buildView(await loadAll());
  return Response.json({ ...view, stats: overviewStats(view), issues: findIssues(view), crypto: cryptoConfigured() }, noStore);
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  const kind = body.kind;
  if (!KINDS.includes(kind)) return Response.json({ error: "Tipo non valido" }, { status: 400 });
  const by = { userId: az.userId, name: await whoName(az.userId) };
  const fail = (r) => Response.json({ error: (r.errors || ["Errore"]).join("; ") }, { status: r.status || 400 });
  try {
    if (body.action === "save") {
      const r = await upsert(kind, { id: body.id || null, fields: body.fields || {}, secrets: body.secrets }, by);
      return r.ok ? Response.json(r) : fail(r);
    }
    if (body.action === "delete") {
      const r = await remove(kind, body.id, by);
      return r.ok ? Response.json(r) : fail(r);
    }
    if (body.action === "reveal") {
      const r = await revealSecret(kind, body.id, body.field, by);
      return r.ok ? Response.json({ value: r.value }, noStore) : fail(r);
    }
    if (body.action === "import") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return Response.json({ error: "Nessuna riga" }, { status: 400 });
      if (rows.length > 5000) return Response.json({ error: "Massimo 5.000 righe per import" }, { status: 400 });
      const inputs = rowsToInputs(kind, rows, body.mapping || {});
      const report = await importRows(kind, inputs, by, { dryRun: Boolean(body.dryRun) });
      return Response.json({ report });
    }
    return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message || "Errore" }, { status: 500 });
  }
}
