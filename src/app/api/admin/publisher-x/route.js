/**
 * /api/admin/publisher-x — conto dei publisher su X (lib/publisher-x).
 * GET ?month=YYYY-MM[&refresh=1] → link X, abbinamenti e conto del mese per publisher (senza nomi dei fan).
 * PUT { config, rev } → salva abbinamenti link→publisher, fee per profilo e regole del conto.
 * Compensi e denaro → SEED (admin), come le altre pagine di comp nuove.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { logAuditAction } from "@/lib/audit-log";
import { getOverview, saveConfig, ConflictError } from "@/lib/publisher-x";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "Warehouse non configurato" }, { status: 503 });
  const url = new URL(request.url);
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  try {
    return Response.json(await getOverview(month, { force: url.searchParams.get("refresh") === "1" }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura non riuscita" }, { status: /mese/.test(e.message || "") ? 400 : 500 });
  }
}

export async function PUT(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => null);
  if (!body?.config) return Response.json({ error: "config mancante" }, { status: 400 });
  try {
    const doc = await saveConfig(body.config, { by: az.userId, expectRev: body.rev ?? null });
    await logAuditAction({ action: "publisher-x.config", target: "pubx:config", by: az.userId, meta: { rev: doc.rev, links: doc.links.length } }).catch(() => {});
    return Response.json({ ok: true, config: doc });
  } catch (e) {
    return Response.json({ error: e.message || "Salvataggio non riuscito" }, { status: e instanceof ConflictError ? 409 : 500 });
  }
}
